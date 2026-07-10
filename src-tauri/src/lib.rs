use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const LOCAL_USER_ID: &str = "local-default";
const CONVERSATION_FILE_NAME: &str = "conversations.json";

fn get_conversation_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to locate the application data directory: {error}"))?;

    Ok(app_data_directory
        .join("users")
        .join(LOCAL_USER_ID)
        .join(CONVERSATION_FILE_NAME))
}

#[tauri::command]
fn load_conversation_store(app: AppHandle) -> Result<Option<String>, String> {
    let file_path = get_conversation_file_path(&app)?;

    if !file_path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&file_path)
        .map_err(|error| format!("Unable to read conversation history: {error}"))?;

    Ok(Some(contents))
}

#[tauri::command]
fn save_conversation_store(
    app: AppHandle,
    conversation_store_json: String,
) -> Result<(), String> {
    let file_path = get_conversation_file_path(&app)?;

    let parent_directory = file_path
        .parent()
        .ok_or_else(|| "Unable to determine the conversation data directory.".to_string())?;

    fs::create_dir_all(parent_directory)
        .map_err(|error| format!("Unable to create the conversation data directory: {error}"))?;

    // Validate the data before writing it so malformed JSON is never saved.
    serde_json::from_str::<serde_json::Value>(&conversation_store_json)
        .map_err(|error| format!("Conversation history contains invalid JSON: {error}"))?;

    fs::write(&file_path, conversation_store_json)
        .map_err(|error| format!("Unable to save conversation history: {error}"))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_conversation_store,
            save_conversation_store
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}