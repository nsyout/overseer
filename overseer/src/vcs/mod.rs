pub mod backend;
pub mod detection;
pub mod git;
pub mod jj;

use std::path::Path;

pub use backend::{
    CommitResult, DiffEntry, LogEntry, VcsBackend, VcsError, VcsInfo, VcsResult, VcsStatus, VcsType,
};
pub use detection::detect_vcs_type;
pub use git::GixBackend;
pub use jj::JjBackend;

pub fn get_backend(path: &Path) -> VcsResult<Box<dyn VcsBackend>> {
    let (vcs_type, root) = detect_vcs_type(path);

    match vcs_type {
        VcsType::Jj => {
            let root = root.ok_or(VcsError::NotARepository)?;
            Ok(Box::new(JjBackend::open(&root)?))
        }
        VcsType::Git => {
            let root = root.ok_or(VcsError::NotARepository)?;
            Ok(Box::new(GixBackend::open(&root)?))
        }
        VcsType::None => Err(VcsError::NotARepository),
    }
}

pub fn detect(path: &Path) -> VcsInfo {
    let (vcs_type, root) = detect_vcs_type(path);
    VcsInfo {
        vcs_type,
        root: root
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
    }
}
