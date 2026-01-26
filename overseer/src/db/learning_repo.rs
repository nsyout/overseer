use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::error::Result;
use crate::id::{LearningId, TaskId};

fn now() -> DateTime<Utc> {
    Utc::now()
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Learning {
    pub id: LearningId,
    pub task_id: TaskId,
    pub content: String,
    pub source_task_id: Option<TaskId>,
    pub created_at: DateTime<Utc>,
}

fn row_to_learning(row: &Row) -> rusqlite::Result<Learning> {
    Ok(Learning {
        id: row.get("id")?,
        task_id: row.get("task_id")?,
        content: row.get("content")?,
        source_task_id: row.get("source_task_id")?,
        created_at: row
            .get::<_, String>("created_at")
            .ok()
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(now),
    })
}

pub fn add_learning(
    conn: &Connection,
    task_id: &TaskId,
    content: &str,
    source_task_id: Option<&TaskId>,
) -> Result<Learning> {
    let id = LearningId::new();
    let now_str = now().to_rfc3339();

    conn.execute(
        r#"
        INSERT INTO learnings (id, task_id, content, source_task_id, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        "#,
        params![&id, task_id, content, source_task_id, now_str],
    )?;

    get_learning(conn, &id)?.ok_or_else(|| crate::error::OsError::LearningNotFound(id))
}

pub fn get_learning(conn: &Connection, id: &LearningId) -> Result<Option<Learning>> {
    let learning = conn
        .query_row(
            "SELECT * FROM learnings WHERE id = ?1",
            params![id],
            row_to_learning,
        )
        .optional()?;
    Ok(learning)
}

pub fn list_learnings(conn: &Connection, task_id: &TaskId) -> Result<Vec<Learning>> {
    let mut stmt =
        conn.prepare("SELECT * FROM learnings WHERE task_id = ?1 ORDER BY created_at ASC")?;
    let learnings = stmt
        .query_map(params![task_id], row_to_learning)?
        .collect::<rusqlite::Result<Vec<Learning>>>()?;
    Ok(learnings)
}

pub fn delete_learning(conn: &Connection, id: &LearningId) -> Result<()> {
    conn.execute("DELETE FROM learnings WHERE id = ?1", params![id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::init_schema;
    use crate::db::task_repo::create_task;
    use crate::types::CreateTaskInput;

    #[test]
    fn test_add_learning() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let task = create_task(
            &conn,
            &CreateTaskInput {
                description: "test task".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        let learning = add_learning(&conn, &task.id, "test learning", None).unwrap();

        assert_eq!(learning.task_id, task.id);
        assert_eq!(learning.content, "test learning");
        assert!(learning.source_task_id.is_none());
    }

    #[test]
    fn test_get_learning() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let task = create_task(
            &conn,
            &CreateTaskInput {
                description: "test task".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        let learning = add_learning(&conn, &task.id, "test learning", None).unwrap();
        let retrieved = get_learning(&conn, &learning.id).unwrap();

        assert!(retrieved.is_some());
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.id, learning.id);
        assert_eq!(retrieved.content, "test learning");
    }

    #[test]
    fn test_get_learning_not_found() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let id = LearningId::new();

        let result = get_learning(&conn, &id).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_list_learnings() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let task = create_task(
            &conn,
            &CreateTaskInput {
                description: "test task".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        add_learning(&conn, &task.id, "learning 1", None).unwrap();
        add_learning(&conn, &task.id, "learning 2", None).unwrap();
        add_learning(&conn, &task.id, "learning 3", None).unwrap();

        let learnings = list_learnings(&conn, &task.id).unwrap();
        assert_eq!(learnings.len(), 3);
        assert_eq!(learnings[0].content, "learning 1");
        assert_eq!(learnings[1].content, "learning 2");
        assert_eq!(learnings[2].content, "learning 3");
    }

    #[test]
    fn test_list_learnings_empty() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let task = create_task(
            &conn,
            &CreateTaskInput {
                description: "test task".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        let learnings = list_learnings(&conn, &task.id).unwrap();
        assert!(learnings.is_empty());
    }

    #[test]
    fn test_learning_with_source_task() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let task1 = create_task(
            &conn,
            &CreateTaskInput {
                description: "task 1".to_string(),
                ..Default::default()
            },
        )
        .unwrap();
        let task2 = create_task(
            &conn,
            &CreateTaskInput {
                description: "task 2".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        let learning =
            add_learning(&conn, &task2.id, "learned from task1", Some(&task1.id)).unwrap();

        assert_eq!(learning.source_task_id, Some(task1.id));
    }

    #[test]
    fn test_delete_learning() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let task = create_task(
            &conn,
            &CreateTaskInput {
                description: "test task".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        let learning = add_learning(&conn, &task.id, "test learning", None).unwrap();
        let id = learning.id;

        delete_learning(&conn, &id).unwrap();

        let result = get_learning(&conn, &id).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_learnings_cascade_on_task_delete() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let task = create_task(
            &conn,
            &CreateTaskInput {
                description: "test task".to_string(),
                ..Default::default()
            },
        )
        .unwrap();

        let learning1 = add_learning(&conn, &task.id, "learning 1", None).unwrap();
        let learning2 = add_learning(&conn, &task.id, "learning 2", None).unwrap();

        crate::db::task_repo::delete_task(&conn, &task.id).unwrap();

        assert!(get_learning(&conn, &learning1.id).unwrap().is_none());
        assert!(get_learning(&conn, &learning2.id).unwrap().is_none());
    }
}
