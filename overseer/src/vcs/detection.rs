use std::path::{Path, PathBuf};

use crate::vcs::backend::VcsType;

pub fn detect_vcs_type(start: &Path) -> (VcsType, Option<PathBuf>) {
    let mut current = start.to_path_buf();

    loop {
        if current.join(".git").exists() {
            return (VcsType::Git, Some(current));
        }
        match current.parent() {
            Some(parent) => current = parent.to_path_buf(),
            None => return (VcsType::None, None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_detect_git_repo() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir(tmp.path().join(".git")).unwrap();

        let (vcs_type, root) = detect_vcs_type(tmp.path());
        assert_eq!(vcs_type, VcsType::Git);
        assert_eq!(root.unwrap(), tmp.path());
    }

    #[test]
    fn test_detect_no_vcs() {
        let tmp = TempDir::new().unwrap();

        let (vcs_type, root) = detect_vcs_type(tmp.path());
        assert_eq!(vcs_type, VcsType::None);
        assert!(root.is_none());
    }

    #[test]
    fn test_detect_in_subdirectory() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir(tmp.path().join(".git")).unwrap();
        let subdir = tmp.path().join("src").join("lib");
        fs::create_dir_all(&subdir).unwrap();

        let (vcs_type, root) = detect_vcs_type(&subdir);
        assert_eq!(vcs_type, VcsType::Git);
        assert_eq!(root.unwrap(), tmp.path());
    }
}
