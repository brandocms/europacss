//! Browser actions must remain bound to a fresh, explicitly previewed compiler plan.
use serde_json::{json, Value};
use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    net::TcpStream,
    path::PathBuf,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

struct Server {
    child: Child,
    root: PathBuf,
    host: String,
}
impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = fs::remove_dir_all(&self.root);
    }
}
impl Server {
    fn new(label: &str, one: &str, two: &str) -> Self {
        Self::with_config(label, one, two, "{}")
    }
    fn with_config(label: &str, one: &str, two: &str, config: &str) -> Self {
        let root =
            std::env::temp_dir().join(format!("europa-review-{label}-{}", std::process::id()));
        fs::create_dir(&root).unwrap();
        fs::write(
            root.join("app.css"),
            "@import 'one.css'; @import 'two.css';",
        )
        .unwrap();
        fs::write(root.join("one.css"), one).unwrap();
        fs::write(root.join("two.css"), two).unwrap();
        fs::write(root.join("europa.json5"), config).unwrap();
        let child = Command::new(env!("CARGO_BIN_EXE_europa"))
            .current_dir(&root)
            .args([
                "migrate",
                "app.css",
                "--from",
                "1.0.0-beta.16",
                "--config",
                "europa.json5",
                "--studio",
            ])
            .env("PATH", "")
            .env("NO_COLOR", "1")
            .stdout(Stdio::null())
            .stderr(fs::File::create(root.join("server.log")).unwrap())
            .spawn()
            .unwrap();
        let mut server = Self {
            child,
            root,
            host: String::new(),
        };
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let log = fs::read_to_string(server.root.join("server.log")).unwrap();
            if let Some(url) = log
                .split_whitespace()
                .find(|s| s.starts_with("http://127.0.0.1:"))
            {
                server.host = url
                    .trim_start_matches("http://")
                    .split('/')
                    .next()
                    .unwrap()
                    .into();
                break;
            }
            assert!(Instant::now() < deadline, "{log}");
            std::thread::sleep(Duration::from_millis(20));
        }
        server
    }
    fn send(&self, method: &str, route: &str, origin: Option<&str>, body: &Value) -> (u16, Value) {
        let body = if method == "GET" {
            String::new()
        } else {
            body.to_string()
        };
        let mut stream = TcpStream::connect(&self.host).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(10)))
            .unwrap();
        let origin = origin
            .map(|s| format!("Origin: {s}\r\n"))
            .unwrap_or_default();
        let request = format!("{method} {route} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{origin}\r\n{body}",self.host,body.len());
        stream.write_all(request.as_bytes()).unwrap();
        // Rejected origins may close with an unread request body, producing a
        // TCP reset on Linux after the complete HTTP response. Read the framed
        // response, rather than requiring a graceful TCP EOF afterward.
        let mut reader = BufReader::new(stream);
        let mut headers = String::new();
        loop {
            let mut line = String::new();
            assert!(reader.read_line(&mut line).unwrap() > 0);
            if line == "\r\n" {
                break;
            }
            headers.push_str(&line);
        }
        let length: usize = headers
            .lines()
            .find_map(|line| line.strip_prefix("Content-Length: "))
            .unwrap()
            .parse()
            .unwrap();
        let mut body = vec![0; length];
        reader.read_exact(&mut body).unwrap();
        (
            headers.split_whitespace().nth(1).unwrap().parse().unwrap(),
            serde_json::from_slice(&body).unwrap(),
        )
    }
    fn get(&self) -> Value {
        let (status, data) = self.send("GET", "/api/migration", None, &Value::Null);
        assert_eq!(status, 200, "{data}");
        data
    }
    fn post(&self, route: &str, body: &Value) -> (u16, Value) {
        self.send(
            "POST",
            &format!("/api/migration/{route}"),
            Some(&format!("http://{}", self.host)),
            body,
        )
    }
}
fn selected(data: &Value, id: &Value, choice: &str) -> Value {
    json!({"snapshot":data["report"]["snapshot"],"decisions":[{"id":id,"choice":choice}]})
}
fn order(data: &Value) -> &Value {
    data["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["code"] == "EU_MIGRATION_ORDER")
        .unwrap()
}

#[test]
fn reviewed_browser_edits_are_grouped_deduplicated_and_require_a_fresh_plan() {
    let source = "/* blåbær 🪐 */\r\n.hero {\r\n  @fontsize body;\r\n  padding:12px;\r\n}";
    let config = "{theme:{typography:{sizes:{body:{__base__:{padding:'25px'},'*':'20px'}}}}}";
    let other = ".other { color: red; }";
    let server = Server::with_config("apply", source, other, config);
    fs::write(server.root.join("base.json5"), config).unwrap();
    fs::write(server.root.join("europa.json5"), "{extends:'base.json5'}").unwrap();
    let data = server.get();
    assert_eq!(data["entry_label"], "app.css");
    assert!(data["report"].get("sources").is_none());
    let item = order(&data);
    assert_eq!(item["path"], "one.css");
    assert_eq!(item["indices"].as_array().unwrap().len(), 4);
    assert_eq!(item["fixes"].as_array().unwrap().len(), 1);
    assert_eq!(item["fixes"][0]["edits"][0]["line"], 3);
    assert_eq!(item["context"][0]["text"], "/* blåbær 🪐 */");
    let selection = selected(&data, &item["id"], "fix");
    assert_eq!(server.post("apply", &json!({"token":"forged"})).0, 409);
    assert_eq!(
        server
            .send("POST", "/api/migration/prepare", None, &selection)
            .0,
        400
    );
    assert_eq!(
        server
            .send(
                "POST",
                "/api/migration/prepare",
                Some("https://example.com"),
                &selection
            )
            .0,
        400
    );
    let (status, review) = server.post("export", &selection);
    assert_eq!(status, 200);
    assert_eq!(review["studio_review"]["decisions"][0]["choice"], "fix");
    assert_eq!(
        review["findings"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|f| f["apply_fix"] == true)
            .count(),
        4
    );
    let (status, plan) = server.post("prepare", &selection);
    assert_eq!(status, 200, "{plan}");
    assert_eq!(plan["edit_count"], 1);
    assert_eq!(
        fs::read_to_string(server.root.join("one.css")).unwrap(),
        source
    );
    // An inherited config change invalidates a plan before any source write.
    fs::write(
        server.root.join("base.json5"),
        "{theme:{spacing:{test:{'*':'10px'}}}}",
    )
    .unwrap();
    assert_eq!(server.post("apply", &json!({"token":plan["token"]})).0, 409);
    assert_eq!(
        fs::read_to_string(server.root.join("one.css")).unwrap(),
        source
    );
    fs::write(server.root.join("base.json5"), config).unwrap();
    let (status, plan) = server.post("prepare", &selection);
    assert_eq!(status, 200);
    // An unrelated imported source is also part of the reviewed snapshot.
    fs::write(server.root.join("two.css"), ".other { color: blue; }").unwrap();
    assert_eq!(server.post("apply", &json!({"token":plan["token"]})).0, 409);
    assert_eq!(
        fs::read_to_string(server.root.join("one.css")).unwrap(),
        source
    );
    fs::write(server.root.join("two.css"), other).unwrap();
    let (_, plan) = server.post("prepare", &selection);
    let (status, result) = server.post("apply", &json!({"token":plan["token"]}));
    assert_eq!(status, 200, "{result}");
    assert_eq!(result["written"], 1);
    assert!(result["workspace"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .all(|i| i["code"] != "EU_MIGRATION_ORDER"));
    assert_eq!(
        fs::read_to_string(server.root.join("one.css")).unwrap(),
        "/* blåbær 🪐 */\r\n.hero {\r\n  padding:12px;\r\n  @fontsize body;\r\n}"
    );
    assert_eq!(
        fs::read_to_string(server.root.join("two.css")).unwrap(),
        other
    );
    assert_eq!(server.post("apply", &json!({"token":plan["token"]})).0, 409);
    assert_eq!(server.post("prepare", &selection).0, 409);
}

#[test]
fn acceptance_syntax_and_manual_items_cannot_be_confused_or_forged() {
    let source = ".card { &__title { color:red } }";
    let server = Server::new("decisions", source, ".a, #b { .child { color:red } }");
    let data = server.get();
    let items = data["items"].as_array().unwrap();
    let syntax = items.iter().find(|i| i["can_fix"] == true).unwrap();
    let semantic = items
        .iter()
        .find(|i| i["code"] == "EU_MIGRATION_SPECIFICITY")
        .unwrap();
    assert_eq!(syntax["can_accept"], false);
    assert_eq!(semantic["can_fix"], false);
    assert_eq!(
        server
            .post("export", &selected(&data, &syntax["id"], "accept"))
            .0,
        409
    );
    assert_eq!(
        server
            .post("prepare", &selected(&data, &semantic["id"], "fix"))
            .0,
        409
    );
    let (status, kept) = server.post("export", &selected(&data, &semantic["id"], "accept"));
    assert_eq!(status, 200, "{kept}");
    assert!(kept["findings"]
        .as_array()
        .unwrap()
        .iter()
        .any(|f| f["accepted"] == true));
    assert_eq!(
        fs::read_to_string(server.root.join("one.css")).unwrap(),
        source
    );
    let mut forged = selected(&data, &syntax["id"], "fix");
    forged["edits"] = json!([{ "filename":"/tmp/arbitrary", "replacement":"wrong" }]);
    assert_eq!(server.post("prepare", &forged).0, 409);
    assert_eq!(
        server
            .post("prepare", &selected(&data, &json!(999999), "fix"))
            .0,
        409
    );
    let mut duplicate = selected(&data, &syntax["id"], "fix");
    duplicate["decisions"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":syntax["id"],"choice":"accept"}));
    assert_eq!(server.post("prepare", &duplicate).0, 409);
    let (status, plan) = server.post("prepare", &selected(&data, &syntax["id"], "fix"));
    assert_eq!(status, 200, "{plan}");
    let (status, result) = server.post("apply", &json!({"token":plan["token"]}));
    assert_eq!(status, 200, "{result}");
    assert!(fs::read_to_string(server.root.join("one.css"))
        .unwrap()
        .contains(".card__title"));
    assert!(result["workspace"]["report"]["findings"]
        .as_array()
        .unwrap()
        .iter()
        .all(|f| f["accepted"] == false));
}

#[test]
fn incomplete_analysis_allows_only_supported_syntax_repairs() {
    let server = Server::new(
        "incomplete",
        ".card { &__title {color:red} }",
        ".broken { @fontsize missing; }",
    );
    let data = server.get();
    assert_eq!(data["report"]["analysis_complete"], false);
    let items = data["items"].as_array().unwrap();
    assert!(items.iter().all(|item| item["can_accept"] == false));
    let syntax = items.iter().find(|item| item["can_fix"] == true).unwrap();
    let (status, plan) = server.post("prepare", &selected(&data, &syntax["id"], "fix"));
    assert_eq!(status, 200, "{plan}");
    let (status, result) = server.post("apply", &json!({"token":plan["token"]}));
    assert_eq!(status, 200, "{result}");
    assert_eq!(result["written"], 1);
    assert_eq!(result["workspace"]["report"]["analysis_complete"], false);
    assert!(fs::read_to_string(server.root.join("one.css"))
        .unwrap()
        .contains(".card__title"));
}
