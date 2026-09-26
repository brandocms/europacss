//! Small loopback-only HTTP transport. No filesystem writes or arbitrary paths.
use crate::cli_output::Ui;
use serde::Deserialize;
use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    time::Duration,
};

const MAX_BODY: usize = 2 * 1024 * 1024;

pub fn run(args: Vec<String>, ui: &Ui) -> Result<(), String> {
    let mut path = None;
    let mut port = 0u16;
    let mut fonts_path = None;
    let mut public_dir = None;
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--config" => path = Some(args.next().ok_or("--config requires a JSON5 path")?),
            "--fonts" => fonts_path = Some(args.next().ok_or("--fonts requires a CSS path")?),
            "--public-dir" => {
                public_dir = Some(args.next().ok_or("--public-dir requires a directory")?)
            }
            "--port" => {
                port = args
                    .next()
                    .ok_or("--port requires a number")?
                    .parse()
                    .map_err(|_| "Invalid port")?
            }
            "--help" | "-h" => {
                println!("Usage: europa studio [--config europa.json5] [--port 0] [--fonts fonts.css] [--public-dir public]\n\nServes Config Studio on 127.0.0.1. Port 0 chooses an available port.\nEdits stay in the browser; Export downloads JSON5 without rewriting the source file.\nProject fonts: auto-detects css/includes/fonts.css and public beside the config.\nUse --fonts and --public-dir for other layouts. Only local font files are served.\nCtrl-C stops the server. No Node runtime required.");
                return Ok(());
            }
            _ => return Err(format!("Unknown studio option: {arg}")),
        }
    }
    let source = match path.as_ref() {
        Some(path) => {
            let meta = fs::metadata(path).map_err(|e| format!("{path}: {e}"))?;
            if meta.len() > 1024 * 1024 {
                return Err("Studio configs are limited to 1 MiB".into());
            }
            fs::read_to_string(path).map_err(|e| format!("{path}: {e}"))?
        }
        None => include_str!("../studio/example.json5").into(),
    };
    let base = path
        .as_deref()
        .map(std::path::Path::new)
        .and_then(std::path::Path::parent);
    let font_file = fonts_path.map(std::path::PathBuf::from).or_else(|| {
        base.map(|base| base.join("css/includes/fonts.css"))
            .filter(|p| p.is_file())
    });
    let public = public_dir
        .map(std::path::PathBuf::from)
        .or_else(|| base.map(|base| base.join("public")).filter(|p| p.is_dir()));
    let fonts = match font_file {
        Some(file) => europacss::studio::fonts::load(&file, public.as_deref())?,
        None => europacss::studio::fonts::Fonts::default(),
    };
    let listener =
        TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).map_err(|e| e.to_string())?;
    let address = listener.local_addr().map_err(|e| e.to_string())?;
    let host = address.to_string();
    let origin = format!("http://{host}");
    ui.studio(&origin);
    let initial = serde_json::json!({"source":source,"name":path.as_deref().and_then(|p| std::path::Path::new(p).file_name()).and_then(|p| p.to_str()).unwrap_or("europa.json5")}).to_string();
    for stream in listener.incoming() {
        let mut stream = stream.map_err(|e| e.to_string())?;
        let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
        let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
        if let Err(error) = handle(&mut stream, &host, &origin, &initial, &fonts) {
            let _ = response(
                &mut stream,
                400,
                "application/json",
                &serde_json::json!({"error":error}).to_string(),
            );
        }
    }
    Ok(())
}

fn handle(
    stream: &mut TcpStream,
    host: &str,
    origin: &str,
    initial: &str,
    fonts: &europacss::studio::fonts::Fonts,
) -> Result<(), String> {
    let mut reader = BufReader::new(&mut *stream);
    let mut line = String::new();
    reader
        .by_ref()
        .take(8193)
        .read_line(&mut line)
        .map_err(|e| e.to_string())?;
    if line.len() > 8192 {
        return Err("Request line too large".into());
    }
    let parts: Vec<_> = line.split_whitespace().map(str::to_owned).collect();
    if parts.len() != 3 || parts[2] != "HTTP/1.1" {
        return Err("Expected HTTP/1.1".into());
    }
    let mut headers = std::collections::HashMap::new();
    let mut count = line.len();
    loop {
        line.clear();
        let read = reader
            .by_ref()
            .take(16385 - count as u64)
            .read_line(&mut line)
            .map_err(|e| e.to_string())?;
        count += read;
        if count > 16384 || read == 0 {
            return Err("Invalid or oversized HTTP headers".into());
        }
        if line == "\r\n" {
            break;
        }
        let (name, value) = line.trim_end().split_once(':').ok_or("Invalid header")?;
        if headers
            .insert(name.to_ascii_lowercase(), value.trim().to_owned())
            .is_some()
        {
            return Err("Duplicate HTTP header".into());
        }
    }
    if headers.get("host").map(String::as_str) != Some(host) {
        return Err("Invalid local Host".into());
    }
    if headers.get("origin").is_some_and(|value| value != origin) {
        return Err("Cross-origin requests are not allowed".into());
    }
    if headers.contains_key("transfer-encoding") {
        return Err("Transfer encoding is unsupported".into());
    }
    let length = headers
        .get("content-length")
        .map(|n| n.parse::<usize>())
        .transpose()
        .map_err(|_| "Invalid content length")?
        .unwrap_or(0);
    if length > MAX_BODY {
        return Err("Request body exceeds 2 MiB".into());
    }
    if parts[0] == "GET" {
        if let Some(asset) = parts[1]
            .strip_prefix("/api/fonts/")
            .and_then(|n| n.parse::<usize>().ok())
            .and_then(|i| fonts.assets.get(i))
        {
            drop(reader);
            return response_bytes(stream, 200, asset.mime, &asset.bytes)
                .map_err(|e| e.to_string());
        }
    }
    let (status, mime, body) = match (parts[0].as_str(), parts[1].as_str()) {
        ("GET", "/") => (200, "text/html; charset=utf-8", include_str!("../studio/index.html").into()),
        ("GET", "/studio.css") => (200, "text/css; charset=utf-8", include_str!("../studio/studio.css").into()),
        ("GET", "/studio.js") => (200, "text/javascript; charset=utf-8", include_str!("../studio/studio.js").into()),
        ("GET", "/preview") => (200, "text/html; charset=utf-8", "<!doctype html><html><head><meta charset=utf-8><meta http-equiv=Content-Security-Policy content=\"default-src 'none'; style-src 'unsafe-inline'; font-src 'self'\"></head><body></body></html>".into()),
        ("GET", "/api/fonts") => (200, "application/json", serde_json::to_string(fonts).unwrap()),
        ("GET", "/api/config") => (200, "application/json", initial.into()),
        ("POST", "/api/preview") => {
            if headers.get("content-type").map(String::as_str) != Some("application/json") { return Err("Expected application/json".into()); }
            let mut bytes = vec![0; length];
            reader.read_exact(&mut bytes).map_err(|e| e.to_string())?;
            #[derive(Deserialize)]
            #[serde(deny_unknown_fields)]
            struct Input { source: String }
            let request: Input = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            match europacss::studio::preview(&request.source) {
                Ok(preview) => (200, "application/json", serde_json::to_string(&preview).unwrap()),
                Err(error) => (422, "application/json", serde_json::json!({"error":error}).to_string()),
            }
        }
        _ => (404, "application/json", "{\"error\":\"Not found\"}".into()),
    };
    drop(reader);
    response(stream, status, mime, &body).map_err(|e| e.to_string())
}

fn response(stream: &mut TcpStream, status: u16, mime: &str, body: &str) -> std::io::Result<()> {
    response_bytes(stream, status, mime, body.as_bytes())
}

fn response_bytes(
    stream: &mut TcpStream,
    status: u16,
    mime: &str,
    body: &[u8],
) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        404 => "Not Found",
        422 => "Unprocessable Content",
        _ => "Bad Request",
    };
    write!(stream, "HTTP/1.1 {status} {reason}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'\r\n\r\n", body.len())?;
    stream.write_all(body)
}
