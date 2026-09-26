use crate::{emit, Error};

pub(crate) struct Source {
    pub name: String,
    pub start: usize,
    pub len: usize,
}

#[derive(Default)]
pub(crate) struct Sources {
    pub text: String,
    pub files: Vec<Source>,
}

impl Sources {
    pub fn add(&mut self, name: String, text: &str) -> usize {
        let start = self.text.len();
        self.text.push_str(text);
        self.text.push('\n'); // Keep empty files and EOF locations distinct.
        self.files.push(Source {
            name,
            start,
            len: text.len(),
        });
        start
    }

    pub fn index(&self, offset: usize) -> usize {
        self.files
            .partition_point(|file| file.start <= offset)
            .saturating_sub(1)
    }

    pub fn content(&self, index: usize) -> &str {
        let file = &self.files[index];
        &self.text[file.start..file.start + file.len]
    }

    pub fn locate(&self, mut error: Error) -> Error {
        if error.filename.is_some() || self.files.is_empty() {
            return error;
        }
        let index = self.index(error.offset);
        let file = &self.files[index];
        error.offset = error.offset.saturating_sub(file.start).min(file.len);
        error = error.locate(self.content(index));
        error.filename = Some(file.name.clone());
        error
    }

    pub fn mapped_error(
        &self,
        code: &str,
        message: String,
        name: &str,
        line: usize,
        column: usize,
    ) -> Error {
        // Parcel normalizes absolute sources against its '/' project root.
        let index = self
            .files
            .iter()
            .position(|file| file.name == name || file.name.strip_prefix('/') == Some(name))
            .unwrap_or(0);
        let offset = emit::offset(self.content(index), line, column);
        self.locate(Error::new(code, message, self.files[index].start + offset))
    }
}
