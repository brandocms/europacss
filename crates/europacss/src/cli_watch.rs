use crate::cli_output::Ui;
use europacss::watch::Snapshot;
use std::{thread, time::Duration};

pub fn run(mut build: impl FnMut() -> Result<Vec<Snapshot>, String>, ui: &Ui) -> ! {
    ui.watching();
    let mut last_error = None;
    loop {
        match build() {
            Ok(inputs) => {
                last_error = None;
                loop {
                    thread::sleep(Duration::from_millis(250));
                    if inputs.iter().any(Snapshot::changed) {
                        break;
                    }
                }
            }
            Err(message) => {
                // Retry failures because a missing import may not yet be in the
                // last successful graph. Keep the error visible without flooding.
                if last_error.as_ref() != Some(&message) {
                    ui.error(&message);
                    last_error = Some(message);
                }
                thread::sleep(Duration::from_secs(1));
            }
        }
    }
}
