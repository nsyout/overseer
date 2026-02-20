//! Test utilities for creating real git repositories.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use tempfile::TempDir;

/// Common operations for test repositories.
pub trait TestRepo {
    /// Returns the root path of the repository.
    fn path(&self) -> &Path;

    /// Creates a file with the given content.
    fn write_file(&self, relative_path: &str, content: &str) -> io::Result<()> {
        let full_path = self.path().join(relative_path);
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(full_path, content)
    }

    /// Reads the content of a file.
    fn read_file(&self, relative_path: &str) -> io::Result<String> {
        fs::read_to_string(self.path().join(relative_path))
    }

    /// Deletes a file.
    fn delete_file(&self, relative_path: &str) -> io::Result<()> {
        fs::remove_file(self.path().join(relative_path))
    }

    /// Checks if a file exists.
    fn file_exists(&self, relative_path: &str) -> bool {
        self.path().join(relative_path).exists()
    }
}

/// A test git repository backed by a temporary directory.
/// Uses std::process::Command to run git commands.
pub struct GitTestRepo {
    #[allow(dead_code)]
    tempdir: TempDir,
    root: PathBuf,
}

impl GitTestRepo {
    /// Creates a new git repository in a temporary directory.
    pub fn new() -> io::Result<Self> {
        let tempdir = TempDir::new()?;
        let root = tempdir.path().to_path_buf();

        let output = std::process::Command::new("git")
            .args(["init"])
            .current_dir(&root)
            .output()?;

        if !output.status.success() {
            return Err(io::Error::other(format!(
                "git init failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        std::process::Command::new("git")
            .args(["config", "user.name", "Test User"])
            .current_dir(&root)
            .output()?;

        std::process::Command::new("git")
            .args(["config", "user.email", "test@example.com"])
            .current_dir(&root)
            .output()?;

        Ok(Self { tempdir, root })
    }

    /// Stages all changes.
    pub fn add_all(&self) -> io::Result<()> {
        let output = std::process::Command::new("git")
            .args(["add", "-A"])
            .current_dir(&self.root)
            .output()?;

        if !output.status.success() {
            return Err(io::Error::other(format!(
                "git add failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }
        Ok(())
    }

    /// Commits staged changes with a message.
    pub fn commit(&self, message: &str) -> io::Result<String> {
        self.add_all()?;

        let output = std::process::Command::new("git")
            .args(["commit", "-m", message, "--allow-empty"])
            .current_dir(&self.root)
            .output()?;

        if !output.status.success() {
            return Err(io::Error::other(format!(
                "git commit failed: {}",
                String::from_utf8_lossy(&output.stderr)
            )));
        }

        let output = std::process::Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&self.root)
            .output()?;

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    /// Gets the current HEAD commit hash.
    pub fn head(&self) -> io::Result<String> {
        let output = std::process::Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&self.root)
            .output()?;

        if !output.status.success() {
            return Err(io::Error::other("git rev-parse HEAD failed"));
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
}

impl TestRepo for GitTestRepo {
    fn path(&self) -> &Path {
        &self.root
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_git_test_repo_creation() {
        let repo = GitTestRepo::new().unwrap();
        assert!(repo.path().join(".git").exists());
    }

    #[test]
    fn test_git_test_repo_write_and_read_file() {
        let repo = GitTestRepo::new().unwrap();
        repo.write_file("test.txt", "hello world").unwrap();
        assert_eq!(repo.read_file("test.txt").unwrap(), "hello world");
    }

    #[test]
    fn test_git_test_repo_nested_file() {
        let repo = GitTestRepo::new().unwrap();
        repo.write_file("src/lib/mod.rs", "// module").unwrap();
        assert!(repo.file_exists("src/lib/mod.rs"));
    }

    #[test]
    fn test_git_test_repo_delete_file() {
        let repo = GitTestRepo::new().unwrap();
        repo.write_file("delete_me.txt", "bye").unwrap();
        assert!(repo.file_exists("delete_me.txt"));
        repo.delete_file("delete_me.txt").unwrap();
        assert!(!repo.file_exists("delete_me.txt"));
    }

    #[test]
    fn test_git_test_repo_commit() {
        let repo = GitTestRepo::new().unwrap();
        repo.write_file("README.md", "# Test").unwrap();
        let hash = repo.commit("Initial commit").unwrap();
        assert!(!hash.is_empty());
        assert_eq!(repo.head().unwrap(), hash);
    }
}
