use crate::{parser::Node, sources::Sources, Output};
use std::collections::HashMap;

/// CSS source locations count CRLF once, and columns use UTF-16 for source-map consumers.
pub fn position(source: &str, offset: usize) -> (usize, usize) {
    let mut line = 0;
    let mut column = 0;
    let mut cr = false;
    for c in source[..offset].chars() {
        match c {
            '\r' | '\u{c}' => {
                line += 1;
                column = 0;
            }
            '\n' => {
                if !cr {
                    line += 1;
                }
                column = 0;
            }
            _ => column += c.len_utf16(),
        }
        cr = c == '\r';
    }
    (line, column)
}

pub fn offset(source: &str, target_line: usize, target_column: usize) -> usize {
    let mut line = 0;
    let mut column = 0;
    let mut cr = false;
    for (offset, c) in source.char_indices() {
        if line == target_line && column >= target_column {
            return offset;
        }
        match c {
            '\r' | '\u{c}' => {
                line += 1;
                column = 0;
            }
            '\n' => {
                if !cr {
                    line += 1;
                }
                column = 0;
            }
            _ => column += c.len_utf16(),
        }
        cr = c == '\r';
    }
    source.len()
}

fn vlq(n: i64, out: &mut String) {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut bits = (n.unsigned_abs() << 1) | u64::from(n < 0);
    loop {
        let mut digit = (bits & 31) as usize;
        bits >>= 5;
        if bits > 0 {
            digit |= 32;
        }
        out.push(ALPHABET[digit] as char);
        if bits == 0 {
            break;
        }
    }
}

pub fn emit(nodes: &[Node], sources: &Sources, source_map: bool) -> Output {
    // Resolve all origin locations in one scan, including when most source is on one line.
    // Re-scanning the source for each emitted node makes source maps quadratic.
    fn collect(nodes: &[Node], offsets: &mut Vec<usize>) {
        for node in nodes {
            offsets.push(node.offset);
            if let Some(children) = &node.children {
                collect(children, offsets);
            }
        }
    }
    let mut offsets = Vec::new();
    if source_map {
        collect(nodes, &mut offsets);
    }
    offsets.sort_unstable();
    offsets.dedup();
    let mut locations = HashMap::new();
    let (mut last, mut line, mut column, mut cr) = (0, 0, 0, false);
    let mut source_index = 0;
    for offset in offsets {
        let index = sources.index(offset);
        if index != source_index {
            (last, line, column, cr) = (sources.files[index].start, 0, 0, false);
            source_index = index;
        }
        for c in sources.text[last..offset].chars() {
            match c {
                '\r' | '\u{c}' => {
                    line += 1;
                    column = 0;
                }
                '\n' => {
                    if !cr {
                        line += 1;
                    }
                    column = 0;
                }
                _ => column += c.len_utf16(),
            }
            cr = c == '\r';
        }
        last = offset;
        locations.insert(offset, (source_index, line, column));
    }
    struct Emitter {
        css: String,
        mappings: String,
        locations: HashMap<usize, (usize, usize, usize)>,
        last_source: i64,
        map: bool,
        last_line: i64,
        last_column: i64,
    }
    impl Emitter {
        fn line(&mut self, text: &str, offset: usize) {
            let text = text.replace("\r\n", "\n").replace(['\r', '\u{c}'], "\n");
            if self.map {
                let (source, line, column) = self.locations[&offset];
                vlq(0, &mut self.mappings); // generated column
                vlq(source as i64 - self.last_source, &mut self.mappings);
                self.last_source = source as i64;
                vlq(line as i64 - self.last_line, &mut self.mappings);
                vlq(column as i64 - self.last_column, &mut self.mappings);
                self.last_line = line as i64;
                self.last_column = column as i64;
                // Every node begins a new generated line. Map its start to its origin.
                for _ in 0..=text.bytes().filter(|&c| c == b'\n').count() {
                    self.mappings.push(';');
                }
            }
            self.css.push_str(&text);
            self.css.push('\n');
        }
        fn nodes(&mut self, nodes: &[Node]) {
            for node in nodes {
                if let Some(children) = &node.children {
                    self.line(&format!("{} {{", node.text), node.offset);
                    self.nodes(children);
                    self.line("}", node.offset);
                } else if node.text.starts_with("/*") {
                    self.line(&node.text, node.offset);
                } else {
                    self.line(&format!("{};", node.text), node.offset);
                }
            }
        }
    }
    let mut emitter = Emitter {
        css: String::new(),
        mappings: String::new(),
        locations,
        map: source_map,
        last_source: 0,
        last_line: 0,
        last_column: 0,
    };
    emitter.nodes(nodes);
    let map = source_map.then(|| {
        serde_json::json!({
            "version": 3, "sources": sources.files.iter().map(|file| &file.name).collect::<Vec<_>>(),
            "sourcesContent": (0..sources.files.len()).map(|i| sources.content(i)).collect::<Vec<_>>(),
            "names": [], "mappings": emitter.mappings
        })
        .to_string()
    });
    Output {
        css: emitter.css,
        map,
        warnings: Vec::new(),
        dependencies: Vec::new(),
    }
}
