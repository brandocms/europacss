//! Input snapshots for change detection, including symlink targets and file contents.
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug)]
pub struct Snapshot {
    path: PathBuf,
    target: PathBuf,
    length: u64,
    hash: blake3::Hash,
}

impl Snapshot {
    pub(crate) fn from_source(path: PathBuf, content: &[u8]) -> Self {
        Self {
            target: path.clone(),
            path,
            length: content.len() as u64,
            hash: blake3::hash(content),
        }
    }

    pub(crate) fn at_path(mut self, path: PathBuf) -> Self {
        self.path = path;
        self
    }

    pub fn read(path: &Path) -> io::Result<Self> {
        let target = fs::canonicalize(path)?;
        let source = fs::read(&target)?;
        Ok(Self::from_source(target, &source).at_path(path.into()))
    }

    /// Returns true for changed, replaced, retargeted, deleted, or unreadable inputs.
    pub fn changed(&self) -> bool {
        let check = || -> io::Result<bool> {
            let target = fs::canonicalize(&self.path)?;
            if target != self.target || fs::metadata(&target)?.len() != self.length {
                return Ok(true);
            }
            Ok(blake3::hash(&fs::read(target)?) != self.hash)
        };
        check().unwrap_or(true)
    }
}
