use overseer::vcs::backend::{ChangeType, FileStatusKind};
use overseer::vcs::{GixBackend, VcsBackend, VcsType};
use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::TempDir;

/// Test helper for creating git repositories
struct GitTestRepo {
    #[allow(dead_code)]
    tempdir: TempDir,
    root: PathBuf,
}

impl GitTestRepo {
    fn new() -> std::io::Result<Self> {
        let tempdir = TempDir::new()?;
        let root = tempdir.path().to_path_buf();

        // Initialize git repo
        Command::new("git")
            .args(["init"])
            .current_dir(&root)
            .output()?;

        // Configure git user for commits
        Command::new("git")
            .args(["config", "user.name", "Test User"])
            .current_dir(&root)
            .output()?;

        Command::new("git")
            .args(["config", "user.email", "test@example.com"])
            .current_dir(&root)
            .output()?;

        Ok(Self { tempdir, root })
    }

    fn path(&self) -> &Path {
        &self.root
    }

    fn write_file(&self, relative_path: &str, content: &str) -> std::io::Result<()> {
        let full_path = self.root.join(relative_path);
        if let Some(parent) = full_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(full_path, content)
    }

    fn delete_file(&self, relative_path: &str) -> std::io::Result<()> {
        std::fs::remove_file(self.root.join(relative_path))
    }

    fn commit(&self, message: &str) -> std::io::Result<String> {
        // Stage all changes
        Command::new("git")
            .args(["add", "-A"])
            .current_dir(&self.root)
            .output()?;

        // Commit
        Command::new("git")
            .args(["commit", "-m", message])
            .current_dir(&self.root)
            .output()?;

        // Get commit hash
        let output = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&self.root)
            .output()?;

        let hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(hash[..12.min(hash.len())].to_string())
    }
}

// === Basic operations ===

#[test]
fn test_open_git_repo() {
    let repo = GitTestRepo::new().unwrap();
    let backend = GixBackend::open(repo.path()).unwrap();
    assert_eq!(backend.vcs_type(), VcsType::Git);
}

#[test]
fn test_status_empty_repo() {
    let repo = GitTestRepo::new().unwrap();
    // Create initial commit so repo has HEAD
    repo.write_file("README.md", "# Test").unwrap();
    repo.commit("initial").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let status = backend.status().unwrap();
    assert!(status.working_copy_id.is_some());
    assert!(status.files.is_empty()); // No uncommitted changes
}

#[test]
fn test_log_empty_repo() {
    let repo = GitTestRepo::new().unwrap();
    // Create initial commit to have log entries
    repo.write_file("README.md", "# Test").unwrap();
    repo.commit("Initial commit").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let log = backend.log(10).unwrap();
    assert!(!log.is_empty());
    assert_eq!(log[0].description, "Initial commit");
}

#[test]
fn test_current_commit_id() {
    let repo = GitTestRepo::new().unwrap();
    repo.write_file("test.txt", "content").unwrap();
    repo.commit("test commit").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let id = backend.current_commit_id().unwrap();
    assert!(!id.is_empty());
    assert_eq!(id.len(), 12); // Truncated to 12 chars
}

// === Status with modified/added/deleted files ===

#[test]
fn test_status_with_modified_file() {
    let repo = GitTestRepo::new().unwrap();
    repo.write_file("test.txt", "initial").unwrap();
    repo.commit("initial commit").unwrap();

    repo.write_file("test.txt", "modified").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let status = backend.status().unwrap();
    assert!(!status.files.is_empty());
    assert_eq!(status.files[0].status, FileStatusKind::Modified);
    assert_eq!(status.files[0].path, "test.txt");
}

#[test]
fn test_status_with_added_file() {
    let repo = GitTestRepo::new().unwrap();
    repo.write_file("README.md", "init").unwrap();
    repo.commit("init").unwrap();

    repo.write_file("new_file.txt", "new content").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let status = backend.status().unwrap();
    assert!(!status.files.is_empty());

    let new_file = status
        .files
        .iter()
        .find(|f| f.path == "new_file.txt")
        .unwrap();
    assert_eq!(new_file.status, FileStatusKind::Untracked);
}

#[test]
fn test_status_with_deleted_file() {
    let repo = GitTestRepo::new().unwrap();
    repo.write_file("to_delete.txt", "content").unwrap();
    repo.commit("add file").unwrap();

    repo.delete_file("to_delete.txt").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let status = backend.status().unwrap();
    assert!(!status.files.is_empty());
    assert_eq!(status.files[0].status, FileStatusKind::Modified); // git status shows as modified (deletion)
}

#[test]
fn test_status_with_multiple_changes() {
    let repo = GitTestRepo::new().unwrap();
    repo.write_file("existing.txt", "content").unwrap();
    repo.commit("initial").unwrap();

    // Multiple change types
    repo.write_file("existing.txt", "modified content").unwrap();
    repo.write_file("new.txt", "new").unwrap();
    repo.delete_file("existing.txt").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let status = backend.status().unwrap();
    assert!(!status.files.is_empty());
}

// === Log with multiple commits ===

#[test]
fn test_log_with_multiple_commits() {
    let repo = GitTestRepo::new().unwrap();

    repo.write_file("file1.txt", "first").unwrap();
    repo.commit("first commit").unwrap();

    repo.write_file("file2.txt", "second").unwrap();
    repo.commit("second commit").unwrap();

    repo.write_file("file3.txt", "third").unwrap();
    repo.commit("third commit").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let log = backend.log(10).unwrap();

    assert!(log.len() >= 3);

    let descriptions: Vec<_> = log.iter().map(|e| e.description.as_str()).collect();
    assert!(descriptions.contains(&"third commit"));
    assert!(descriptions.contains(&"second commit"));
    assert!(descriptions.contains(&"first commit"));

    // Verify order (most recent first)
    assert_eq!(log[0].description, "third commit");
    assert_eq!(log[1].description, "second commit");
    assert_eq!(log[2].description, "first commit");
}

#[test]
fn test_log_limit() {
    let repo = GitTestRepo::new().unwrap();

    for i in 0..5 {
        repo.write_file(&format!("file{i}.txt"), &format!("content{i}"))
            .unwrap();
        repo.commit(&format!("commit {i}")).unwrap();
    }

    let backend = GixBackend::open(repo.path()).unwrap();
    let log = backend.log(2).unwrap();
    assert_eq!(log.len(), 2);

    // Should get the two most recent commits
    assert_eq!(log[0].description, "commit 4");
    assert_eq!(log[1].description, "commit 3");
}

#[test]
fn test_log_entry_fields() {
    let repo = GitTestRepo::new().unwrap();
    repo.write_file("test.txt", "content").unwrap();
    repo.commit("test message").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let log = backend.log(1).unwrap();

    assert_eq!(log.len(), 1);
    let entry = &log[0];

    assert!(!entry.id.is_empty());
    assert_eq!(entry.description, "test message");
    assert!(!entry.author.is_empty());
    // timestamp should be recent
    assert!(entry.timestamp.timestamp() > 0);
}

// === Diff with various change types ===

#[test]
fn test_diff_empty_working_copy() {
    let repo = GitTestRepo::new().unwrap();
    repo.write_file("test.txt", "content").unwrap();
    repo.commit("initial").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let diff = backend.diff(None).unwrap();
    assert!(diff.is_empty());
}

#[test]
fn test_diff_with_added_file() {
    let repo = GitTestRepo::new().unwrap();
    repo.write_file("initial.txt", "init").unwrap();
    repo.commit("initial").unwrap();

    repo.write_file("new.txt", "new content").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let diff = backend.diff(None).unwrap();

    assert!(!diff.is_empty());
    let new_entry = diff.iter().find(|e| e.path == "new.txt").unwrap();
    assert_eq!(new_entry.change_type, ChangeType::Added);
}

#[test]
fn test_diff_with_modified_file() {
    let repo = GitTestRepo::new().unwrap();
    repo.write_file("test.txt", "initial").unwrap();
    repo.commit("initial").unwrap();

    repo.write_file("test.txt", "modified").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let diff = backend.diff(None).unwrap();

    assert!(!diff.is_empty());
    assert_eq!(diff[0].change_type, ChangeType::Modified);
    assert_eq!(diff[0].path, "test.txt");
}

#[test]
fn test_diff_with_multiple_changes() {
    let repo = GitTestRepo::new().unwrap();
    repo.write_file("existing.txt", "content").unwrap();
    repo.commit("initial").unwrap();

    repo.write_file("existing.txt", "modified").unwrap();
    repo.write_file("new.txt", "new").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let diff = backend.diff(None).unwrap();

    assert!(diff.len() >= 2);
    assert!(diff.iter().any(|e| e.path == "existing.txt"));
    assert!(diff.iter().any(|e| e.path == "new.txt"));
}

// === Commit workflow ===

#[test]
fn test_commit_workflow() {
    let repo = GitTestRepo::new().unwrap();
    repo.write_file("init.txt", "init").unwrap();
    repo.commit("initial").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let id_before = backend.current_commit_id().unwrap();

    repo.write_file("new.txt", "content").unwrap();
    let result = backend.commit("test commit").unwrap();

    assert_eq!(result.message, "test commit");
    assert!(!result.id.is_empty());
    assert_eq!(result.id.len(), 12);

    let id_after = backend.current_commit_id().unwrap();
    assert_ne!(id_before, id_after);
}

#[test]
fn test_commit_nothing_to_commit() {
    let repo = GitTestRepo::new().unwrap();
    repo.write_file("test.txt", "content").unwrap();
    repo.commit("initial").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let result = backend.commit("should fail");

    assert!(result.is_err());
    match result.unwrap_err() {
        overseer::vcs::VcsError::NothingToCommit => {}
        other => panic!("Expected NothingToCommit, got {:?}", other),
    }
}

#[test]
fn test_commit_updates_current_id() {
    let repo = GitTestRepo::new().unwrap();
    repo.write_file("test.txt", "initial").unwrap();
    repo.commit("initial").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    let id_before = backend.current_commit_id().unwrap();

    repo.write_file("test.txt", "modified").unwrap();
    let commit_result = backend.commit("update file").unwrap();

    let id_after = backend.current_commit_id().unwrap();
    assert_ne!(id_before, id_after);
    assert_eq!(id_after, commit_result.id);
}

#[test]
fn test_commit_clears_working_copy_changes() {
    let repo = GitTestRepo::new().unwrap();
    repo.write_file("init.txt", "init").unwrap();
    repo.commit("initial").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();

    repo.write_file("new.txt", "content").unwrap();
    backend.commit("add new file").unwrap();

    // After commit, working copy should be clean
    let status = backend.status().unwrap();
    assert!(status.files.is_empty());
}

#[test]
fn test_commit_with_multiline_message() {
    let repo = GitTestRepo::new().unwrap();
    repo.write_file("init.txt", "init").unwrap();
    repo.commit("initial").unwrap();

    let backend = GixBackend::open(repo.path()).unwrap();
    repo.write_file("test.txt", "content").unwrap();

    let message = "Short summary\n\nLong description\nwith multiple lines";
    let result = backend.commit(message).unwrap();

    assert_eq!(result.message, message);

    let log = backend.log(1).unwrap();
    assert_eq!(log[0].description, message);
}

// === Root path ===

#[test]
fn test_root_path() {
    let repo = GitTestRepo::new().unwrap();
    let backend = GixBackend::open(repo.path()).unwrap();
    let root = backend.root();

    assert!(!root.is_empty());
    assert!(std::path::Path::new(root).exists());
}
