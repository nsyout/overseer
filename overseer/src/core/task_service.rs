use std::collections::HashSet;

use rusqlite::Connection;

use crate::db::{self, learning_repo, task_repo};
use crate::error::{OsError, Result};
use crate::id::TaskId;
use crate::types::{
    CreateTaskInput, InheritedLearnings, ListTasksFilter, Task, TaskContext, UpdateTaskInput,
};
use crate::vcs;

const MAX_DEPTH: i32 = 2;

pub struct TaskService<'a> {
    conn: &'a Connection,
}

impl<'a> TaskService<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn create(&self, input: &CreateTaskInput) -> Result<Task> {
        if let Some(ref parent_id) = input.parent_id {
            if !task_repo::task_exists(self.conn, parent_id)? {
                return Err(OsError::ParentNotFound(parent_id.clone()));
            }

            let parent_depth = task_repo::get_task_depth(self.conn, parent_id)?;
            if parent_depth >= MAX_DEPTH {
                return Err(OsError::MaxDepthExceeded);
            }
        }

        for blocker_id in &input.blocked_by {
            if !task_repo::task_exists(self.conn, blocker_id)? {
                return Err(OsError::BlockerNotFound(blocker_id.clone()));
            }
        }

        let mut task = task_repo::create_task(self.conn, input)?;
        task.depth = Some(self.get_depth(&task.id)?);
        Ok(task)
    }

    pub fn get(&self, id: &TaskId) -> Result<Task> {
        let mut task =
            task_repo::get_task(self.conn, id)?.ok_or_else(|| OsError::TaskNotFound(id.clone()))?;
        task.depth = Some(self.get_depth(id)?);
        task.context_chain = Some(self.assemble_context_chain(&task)?);
        task.learnings = Some(self.assemble_inherited_learnings(&task)?);
        Ok(task)
    }

    pub fn list(&self, filter: &ListTasksFilter) -> Result<Vec<Task>> {
        let mut tasks = task_repo::list_tasks(self.conn, filter)?;
        for task in &mut tasks {
            task.depth = Some(self.get_depth(&task.id)?);
        }
        Ok(tasks)
    }

    pub fn update(&self, id: &TaskId, input: &UpdateTaskInput) -> Result<Task> {
        if !task_repo::task_exists(self.conn, id)? {
            return Err(OsError::TaskNotFound(id.clone()));
        }

        if let Some(ref new_parent_id) = input.parent_id {
            if !task_repo::task_exists(self.conn, new_parent_id)? {
                return Err(OsError::ParentNotFound(new_parent_id.clone()));
            }

            // Check for cycles first - more specific error
            if self.would_create_parent_cycle(id, new_parent_id)? {
                return Err(OsError::ParentCycle);
            }

            // Then check depth limit
            let parent_depth = task_repo::get_task_depth(self.conn, new_parent_id)?;
            if parent_depth >= MAX_DEPTH {
                return Err(OsError::MaxDepthExceeded);
            }
        }

        let mut task = task_repo::update_task(self.conn, id, input)?;
        task.depth = Some(self.get_depth(id)?);
        Ok(task)
    }

    pub fn start(&self, id: &TaskId) -> Result<Task> {
        if !task_repo::task_exists(self.conn, id)? {
            return Err(OsError::TaskNotFound(id.clone()));
        }
        let mut task = task_repo::start_task(self.conn, id)?;
        task.depth = Some(self.get_depth(id)?);
        Ok(task)
    }

    pub fn complete(&self, id: &TaskId, result: Option<&str>) -> Result<Task> {
        if !task_repo::task_exists(self.conn, id)? {
            return Err(OsError::TaskNotFound(id.clone()));
        }

        if task_repo::has_pending_children(self.conn, id)? {
            return Err(OsError::PendingChildren);
        }

        // Auto-populate commit_sha if VCS is available (Invariant #6)
        let commit_sha = Self::get_current_commit_sha();

        let mut task = task_repo::complete_task(self.conn, id, result, commit_sha.as_deref())?;
        task.depth = Some(self.get_depth(id)?);
        Ok(task)
    }

    fn get_current_commit_sha() -> Option<String> {
        // Try to get VCS backend from current directory
        let cwd = std::env::current_dir().ok()?;
        let backend = vcs::get_backend(&cwd).ok()?;
        backend.current_commit_id().ok()
    }

    pub fn reopen(&self, id: &TaskId) -> Result<Task> {
        if !task_repo::task_exists(self.conn, id)? {
            return Err(OsError::TaskNotFound(id.clone()));
        }
        let mut task = task_repo::reopen_task(self.conn, id)?;
        task.depth = Some(self.get_depth(id)?);
        Ok(task)
    }

    pub fn delete(&self, id: &TaskId) -> Result<()> {
        if !task_repo::task_exists(self.conn, id)? {
            return Err(OsError::TaskNotFound(id.clone()));
        }
        task_repo::delete_task(self.conn, id)
    }

    pub fn add_blocker(&self, task_id: &TaskId, blocker_id: &TaskId) -> Result<Task> {
        if !task_repo::task_exists(self.conn, task_id)? {
            return Err(OsError::TaskNotFound(task_id.clone()));
        }
        if !task_repo::task_exists(self.conn, blocker_id)? {
            return Err(OsError::BlockerNotFound(blocker_id.clone()));
        }

        if self.would_create_blocker_cycle(task_id, blocker_id)? {
            return Err(OsError::BlockerCycle);
        }

        task_repo::add_blocker(self.conn, task_id, blocker_id)?;
        self.get(task_id)
    }

    pub fn remove_blocker(&self, task_id: &TaskId, blocker_id: &TaskId) -> Result<Task> {
        if !task_repo::task_exists(self.conn, task_id)? {
            return Err(OsError::TaskNotFound(task_id.clone()));
        }
        task_repo::remove_blocker(self.conn, task_id, blocker_id)?;
        self.get(task_id)
    }

    fn get_depth(&self, id: &TaskId) -> Result<i32> {
        task_repo::get_task_depth(self.conn, id)
    }

    fn assemble_context_chain(&self, task: &Task) -> Result<TaskContext> {
        let depth = task.depth.unwrap_or(0);
        let own = task.context.clone();

        match depth {
            0 => {
                // Milestone - only own context
                Ok(TaskContext {
                    own,
                    parent: None,
                    milestone: None,
                })
            }
            1 => {
                // Task with milestone parent
                let parent = task
                    .parent_id
                    .as_ref()
                    .and_then(|pid| task_repo::get_task(self.conn, pid).ok()?)
                    .map(|p| p.context);

                Ok(TaskContext {
                    own,
                    parent: parent.clone(),
                    milestone: parent,
                })
            }
            _ => {
                // Subtask with task parent and milestone grandparent
                let parent_task = task
                    .parent_id
                    .as_ref()
                    .and_then(|pid| task_repo::get_task(self.conn, pid).ok()?);

                let parent = parent_task.as_ref().map(|p| p.context.clone());

                let milestone = parent_task
                    .as_ref()
                    .and_then(|p| p.parent_id.as_ref())
                    .and_then(|mid| task_repo::get_task(self.conn, mid).ok()?)
                    .map(|m| m.context);

                Ok(TaskContext {
                    own,
                    parent,
                    milestone,
                })
            }
        }
    }

    fn assemble_inherited_learnings(&self, task: &Task) -> Result<InheritedLearnings> {
        let depth = task.depth.unwrap_or(0);

        match depth {
            0 => {
                // Milestone - no inherited learnings
                Ok(InheritedLearnings {
                    milestone: vec![],
                    parent: vec![],
                })
            }
            1 => {
                // Task with milestone parent
                let milestone = task
                    .parent_id
                    .as_ref()
                    .map(|pid| learning_repo::list_learnings(self.conn, pid))
                    .transpose()?
                    .unwrap_or_default();

                Ok(InheritedLearnings {
                    milestone,
                    parent: vec![],
                })
            }
            _ => {
                // Subtask with task parent and milestone grandparent
                let parent_id = task.parent_id.as_ref();
                let parent = parent_id
                    .map(|pid| learning_repo::list_learnings(self.conn, pid))
                    .transpose()?
                    .unwrap_or_default();

                let milestone_id = parent_id
                    .and_then(|pid| task_repo::get_task(self.conn, pid).ok()?)
                    .and_then(|p| p.parent_id);

                let milestone = milestone_id
                    .as_ref()
                    .map(|mid| learning_repo::list_learnings(self.conn, mid))
                    .transpose()?
                    .unwrap_or_default();

                Ok(InheritedLearnings { milestone, parent })
            }
        }
    }

    fn would_create_parent_cycle(&self, task_id: &TaskId, new_parent_id: &TaskId) -> Result<bool> {
        let mut current = Some(new_parent_id.clone());
        while let Some(ref cid) = current {
            if cid == task_id {
                return Ok(true);
            }
            let task = task_repo::get_task(self.conn, cid)?;
            current = task.and_then(|t| t.parent_id);
        }
        Ok(false)
    }

    fn would_create_blocker_cycle(
        &self,
        task_id: &TaskId,
        new_blocker_id: &TaskId,
    ) -> Result<bool> {
        let mut visited = HashSet::new();
        let mut stack = vec![new_blocker_id.clone()];

        while let Some(current) = stack.pop() {
            if &current == task_id {
                return Ok(true);
            }
            if visited.contains(&current) {
                continue;
            }
            visited.insert(current.clone());

            let blockers = db::get_blockers(self.conn, &current)?;
            stack.extend(blockers);
        }

        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema;

    fn setup_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        schema::init_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn test_context_chain_milestone() {
        let conn = setup_db();
        let service = TaskService::new(&conn);

        let milestone = service
            .create(&CreateTaskInput {
                description: "Milestone".to_string(),
                context: Some("Milestone context".to_string()),
                parent_id: None,
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        let task = service.get(&milestone.id).unwrap();
        let ctx = task.context_chain.unwrap();

        assert_eq!(ctx.own, "Milestone context");
        assert_eq!(ctx.parent, None);
        assert_eq!(ctx.milestone, None);
    }

    #[test]
    fn test_context_chain_task() {
        let conn = setup_db();
        let service = TaskService::new(&conn);

        let milestone = service
            .create(&CreateTaskInput {
                description: "Milestone".to_string(),
                context: Some("Milestone context".to_string()),
                parent_id: None,
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        let task = service
            .create(&CreateTaskInput {
                description: "Task".to_string(),
                context: Some("Task context".to_string()),
                parent_id: Some(milestone.id.clone()),
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        let task = service.get(&task.id).unwrap();
        let ctx = task.context_chain.unwrap();

        assert_eq!(ctx.own, "Task context");
        assert_eq!(ctx.parent, Some("Milestone context".to_string()));
        assert_eq!(ctx.milestone, Some("Milestone context".to_string()));
    }

    #[test]
    fn test_context_chain_subtask() {
        let conn = setup_db();
        let service = TaskService::new(&conn);

        let milestone = service
            .create(&CreateTaskInput {
                description: "Milestone".to_string(),
                context: Some("Milestone context".to_string()),
                parent_id: None,
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        let task = service
            .create(&CreateTaskInput {
                description: "Task".to_string(),
                context: Some("Task context".to_string()),
                parent_id: Some(milestone.id.clone()),
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        let subtask = service
            .create(&CreateTaskInput {
                description: "Subtask".to_string(),
                context: Some("Subtask context".to_string()),
                parent_id: Some(task.id.clone()),
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        let subtask = service.get(&subtask.id).unwrap();
        let ctx = subtask.context_chain.unwrap();

        assert_eq!(ctx.own, "Subtask context");
        assert_eq!(ctx.parent, Some("Task context".to_string()));
        assert_eq!(ctx.milestone, Some("Milestone context".to_string()));
    }

    #[test]
    fn test_inherited_learnings_milestone() {
        let conn = setup_db();
        let service = TaskService::new(&conn);

        let milestone = service
            .create(&CreateTaskInput {
                description: "Milestone".to_string(),
                context: Some("Milestone context".to_string()),
                parent_id: None,
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        learning_repo::add_learning(&conn, &milestone.id, "Milestone learning", None).unwrap();

        let task = service.get(&milestone.id).unwrap();
        let learnings = task.learnings.unwrap();

        assert_eq!(learnings.milestone.len(), 0);
        assert_eq!(learnings.parent.len(), 0);
    }

    #[test]
    fn test_inherited_learnings_task() {
        let conn = setup_db();
        let service = TaskService::new(&conn);

        let milestone = service
            .create(&CreateTaskInput {
                description: "Milestone".to_string(),
                context: Some("Milestone context".to_string()),
                parent_id: None,
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        learning_repo::add_learning(&conn, &milestone.id, "Milestone learning 1", None).unwrap();
        learning_repo::add_learning(&conn, &milestone.id, "Milestone learning 2", None).unwrap();

        let task = service
            .create(&CreateTaskInput {
                description: "Task".to_string(),
                context: Some("Task context".to_string()),
                parent_id: Some(milestone.id.clone()),
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        learning_repo::add_learning(&conn, &task.id, "Task learning", None).unwrap();

        let task = service.get(&task.id).unwrap();
        let learnings = task.learnings.unwrap();

        assert_eq!(learnings.milestone.len(), 2);
        assert_eq!(learnings.milestone[0].content, "Milestone learning 1");
        assert_eq!(learnings.milestone[1].content, "Milestone learning 2");
        assert_eq!(learnings.parent.len(), 0);
    }

    #[test]
    fn test_inherited_learnings_subtask() {
        let conn = setup_db();
        let service = TaskService::new(&conn);

        let milestone = service
            .create(&CreateTaskInput {
                description: "Milestone".to_string(),
                context: Some("Milestone context".to_string()),
                parent_id: None,
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        learning_repo::add_learning(&conn, &milestone.id, "Milestone learning", None).unwrap();

        let task = service
            .create(&CreateTaskInput {
                description: "Task".to_string(),
                context: Some("Task context".to_string()),
                parent_id: Some(milestone.id.clone()),
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        learning_repo::add_learning(&conn, &task.id, "Task learning 1", None).unwrap();
        learning_repo::add_learning(&conn, &task.id, "Task learning 2", None).unwrap();

        let subtask = service
            .create(&CreateTaskInput {
                description: "Subtask".to_string(),
                context: Some("Subtask context".to_string()),
                parent_id: Some(task.id.clone()),
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        learning_repo::add_learning(&conn, &subtask.id, "Subtask learning", None).unwrap();

        let subtask = service.get(&subtask.id).unwrap();
        let learnings = subtask.learnings.unwrap();

        assert_eq!(learnings.milestone.len(), 1);
        assert_eq!(learnings.milestone[0].content, "Milestone learning");
        assert_eq!(learnings.parent.len(), 2);
        assert_eq!(learnings.parent[0].content, "Task learning 1");
        assert_eq!(learnings.parent[1].content, "Task learning 2");
    }

    #[test]
    fn test_complete_task_without_vcs() {
        // Test that completing a task works even without VCS
        let conn = setup_db();
        let service = TaskService::new(&conn);

        let task = service
            .create(&CreateTaskInput {
                description: "Test task".to_string(),
                context: Some("Test context".to_string()),
                parent_id: None,
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        let completed = service.complete(&task.id, Some("Done")).unwrap();

        assert!(completed.completed);
        assert_eq!(completed.result, Some("Done".to_string()));
        // commit_sha might be None if no VCS is available, or Some if running in a repo
        // We just verify the operation succeeds
    }

    #[test]
    fn test_complete_task_captures_commit_sha() {
        // This test only verifies the structure - actual commit SHA capture
        // depends on whether the test runs in a VCS repository
        let conn = setup_db();
        let service = TaskService::new(&conn);

        let task = service
            .create(&CreateTaskInput {
                description: "Test task".to_string(),
                context: Some("Test context".to_string()),
                parent_id: None,
                priority: None,
                blocked_by: vec![],
            })
            .unwrap();

        // Verify commit_sha is initially None
        assert_eq!(task.commit_sha, None);

        let completed = service.complete(&task.id, Some("Done")).unwrap();

        assert!(completed.completed);
        // If we're in a VCS repo (jj or git), commit_sha should be populated
        // If not, it will be None - both are valid outcomes
        // The key is that the operation succeeds without error
    }
}
