use std::time::Duration;

use protocol::{PixcallListEntryIdsRequest, PixcallListEntryIdsResult};
use rusqlite::{Connection, OpenFlags};

use super::{HandlerError, HandlerResult};

const ENTRY_IDS_SQL: &str =
    "SELECT CAST(id AS TEXT) FROM entries WHERE kind = 1 AND is_deleted = 0 ORDER BY id";

pub fn handle(request: PixcallListEntryIdsRequest) -> HandlerResult<PixcallListEntryIdsResult> {
    let connection =
        Connection::open_with_flags(&request.database_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|error| {
                HandlerError::new(
                    "PIXCALL_DATABASE_OPEN_FAILED",
                    format!(
                        "failed to open Pixcall database {}: {error}",
                        request.database_path
                    ),
                )
            })?;

    connection
        .busy_timeout(Duration::from_secs(2))
        .map_err(|error| {
            HandlerError::new(
                "PIXCALL_DATABASE_CONFIG_FAILED",
                format!("failed to configure Pixcall database: {error}"),
            )
        })?;

    let ids = read_entry_ids(&connection).map_err(|error| {
        HandlerError::new(
            "PIXCALL_DATABASE_QUERY_FAILED",
            format!("failed to enumerate Pixcall entries: {error}"),
        )
    })?;

    Ok(PixcallListEntryIdsResult {
        database_path: request.database_path,
        ids,
    })
}

fn read_entry_ids(connection: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut statement = connection.prepare(ENTRY_IDS_SQL)?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::read_entry_ids;

    #[test]
    fn returns_live_file_entries_only() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "
                CREATE TABLE entries (
                    id INTEGER PRIMARY KEY,
                    kind INTEGER NOT NULL,
                    is_deleted INTEGER NOT NULL
                );
                INSERT INTO entries (id, kind, is_deleted) VALUES
                    (3, 1, 0),
                    (2, 0, 0),
                    (1, 1, 1),
                    (4, 1, 0);
                ",
            )
            .unwrap();

        assert_eq!(read_entry_ids(&connection).unwrap(), vec!["3", "4"]);
    }
}
