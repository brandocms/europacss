//! Optional browser comparison. The compiler itself never requires Node or CDP.
use std::{
    io::Write,
    process::{Command, ExitCode, Stdio},
};

pub fn run(args: Vec<String>) -> Result<ExitCode, String> {
    let mut child = Command::new("node")
        .args(["--input-type=module", "-"])
        .args(args)
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!("europa compare requires Node.js 22+ and a Chromium CDP endpoint: {e}")
        })?;
    if let Err(error) = child
        .stdin
        .take()
        .unwrap()
        .write_all(include_bytes!("../compare/compare.mjs"))
    {
        let _ = child.kill();
        let _ = child.wait();
        return Err(format!("Cannot start browser comparison: {error}"));
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    Ok(ExitCode::from(
        status.code().unwrap_or(2).clamp(0, 255) as u8
    ))
}
