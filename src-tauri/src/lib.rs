use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::time::Duration;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const LOCAL_USER_ID: &str = "local-default";
const CONVERSATION_FILE_NAME: &str = "conversations.json";

const AMADEUS_MODEL_NAME: &str = "amadeus-kurisu";
const BASE_MODEL_NAME: &str = "llama3.1:8b";

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn get_conversation_file_path(
    app: &AppHandle,
) -> Result<PathBuf, String> {
    let app_data_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| {
            format!(
                "Unable to locate the application data directory: {error}"
            )
        })?;

    Ok(app_data_directory
        .join("users")
        .join(LOCAL_USER_ID)
        .join(CONVERSATION_FILE_NAME))
}

fn get_ollama_executable_path() -> Option<PathBuf> {
    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        let installed_path = PathBuf::from(local_app_data)
            .join("Programs")
            .join("Ollama")
            .join("ollama.exe");

        if installed_path.exists() {
            return Some(installed_path);
        }
    }

    // Fall back to PATH when Ollama was installed elsewhere.
    if command_exists("ollama") {
        return Some(PathBuf::from("ollama"));
    }

    None
}

fn command_exists(command_name: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        Command::new("where.exe")
            .arg(command_name)
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("which")
            .arg(command_name)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
}

fn run_command_and_capture(
    executable: &Path,
    arguments: &[&str],
) -> Result<Output, String> {
    let mut command = Command::new(executable);
    command.args(arguments);

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command.output().map_err(|error| {
        format!(
            "Unable to run {}: {error}",
            executable.display()
        )
    })
}

fn format_command_failure(
    action: &str,
    output: &Output,
) -> String {
    let stderr =
        String::from_utf8_lossy(&output.stderr).trim().to_string();

    let stdout =
        String::from_utf8_lossy(&output.stdout).trim().to_string();

    let details = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        "The command exited without additional details.".to_string()
    };

    format!("{action} failed: {details}")
}

fn resolve_modelfile_path(
    app: &AppHandle,
) -> Result<PathBuf, String> {
    let resource_path = app
        .path()
        .resolve(
            "resources/Modelfile",
            BaseDirectory::Resource,
        )
        .map_err(|error| {
            format!(
                "Unable to locate the bundled Amadeus Modelfile: {error}"
            )
        })?;

    if !resource_path.exists() {
        return Err(format!(
            "The bundled Modelfile was not found at {}.",
            resource_path.display()
        ));
    }

    Ok(resource_path)
}

#[tauri::command]
fn load_conversation_store(
    app: AppHandle,
) -> Result<Option<String>, String> {
    let file_path =
        get_conversation_file_path(&app)?;

    if !file_path.exists() {
        return Ok(None);
    }

    let contents =
        fs::read_to_string(&file_path).map_err(|error| {
            format!(
                "Unable to read conversation history: {error}"
            )
        })?;

    Ok(Some(contents))
}

#[tauri::command]
fn save_conversation_store(
    app: AppHandle,
    conversation_store_json: String,
) -> Result<(), String> {
    let file_path =
        get_conversation_file_path(&app)?;

    let parent_directory =
        file_path.parent().ok_or_else(|| {
            "Unable to determine the conversation data directory."
                .to_string()
        })?;

    fs::create_dir_all(parent_directory).map_err(
        |error| {
            format!(
                "Unable to create the conversation data directory: {error}"
            )
        },
    )?;

    serde_json::from_str::<serde_json::Value>(
        &conversation_store_json,
    )
    .map_err(|error| {
        format!(
            "Conversation history contains invalid JSON: {error}"
        )
    })?;

    fs::write(&file_path, conversation_store_json).map_err(
        |error| {
            format!(
                "Unable to save conversation history: {error}"
            )
        },
    )?;

    Ok(())
}

#[tauri::command]
async fn is_ollama_installed() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        Ok(get_ollama_executable_path().is_some())
    })
    .await
    .map_err(|error| {
        format!(
            "Unable to check the Ollama installation: {error}"
        )
    })?
}

#[tauri::command]
async fn install_ollama() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(not(target_os = "windows"))]
        {
            return Err(
                "Automatic Ollama installation is currently supported only on Windows."
                    .to_string(),
            );
        }

        #[cfg(target_os = "windows")]
        {
            let install_script =
                "irm https://ollama.com/install.ps1 | iex";

            let output = Command::new("powershell.exe")
                .args([
                    "-NoLogo",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    install_script,
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map_err(|error| {
                    format!(
                        "Unable to start the Ollama installer: {error}"
                    )
                })?;

            if !output.status.success() {
                return Err(format_command_failure(
                    "Ollama installation",
                    &output,
                ));
            }

            Ok(
                "Ollama installation completed successfully."
                    .to_string(),
            )
        }
    })
    .await
    .map_err(|error| {
        format!(
            "The Ollama installation task failed: {error}"
        )
    })?
}

#[tauri::command]
async fn start_ollama() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let executable =
            get_ollama_executable_path().ok_or_else(|| {
                "Ollama is not installed or could not be located."
                    .to_string()
            })?;

        let mut command = Command::new(&executable);

        command
            .arg("serve")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);

        command.spawn().map_err(|error| {
            format!(
                "Unable to start the Ollama service: {error}"
            )
        })?;

        // Give the local service a moment to bind to port 11434.
        std::thread::sleep(Duration::from_secs(2));

        Ok("Ollama was started.".to_string())
    })
    .await
    .map_err(|error| {
        format!("The Ollama startup task failed: {error}")
    })?
}

#[tauri::command]
async fn create_amadeus_model(
    app: AppHandle,
) -> Result<String, String> {
    let modelfile_path =
        resolve_modelfile_path(&app)?;

    tauri::async_runtime::spawn_blocking(move || {
        let executable =
            get_ollama_executable_path().ok_or_else(|| {
                "Ollama is not installed or could not be located."
                    .to_string()
            })?;

        let executable_path = executable.as_path();

        let pull_output = run_command_and_capture(
            executable_path,
            &["pull", BASE_MODEL_NAME],
        )?;

        if !pull_output.status.success() {
            return Err(format_command_failure(
                "Downloading the base Llama model",
                &pull_output,
            ));
        }

        let modelfile_string =
            modelfile_path.to_string_lossy().to_string();

        let create_output = run_command_and_capture(
            executable_path,
            &[
                "create",
                AMADEUS_MODEL_NAME,
                "-f",
                &modelfile_string,
            ],
        )?;

        if !create_output.status.success() {
            return Err(format_command_failure(
                "Creating the Amadeus model",
                &create_output,
            ));
        }

        Ok(
            "The amadeus-kurisu model was created successfully."
                .to_string(),
        )
    })
    .await
    .map_err(|error| {
        format!(
            "The Amadeus model creation task failed: {error}"
        )
    })?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_conversation_store,
            save_conversation_store,
            is_ollama_installed,
            install_ollama,
            start_ollama,
            create_amadeus_model
        ])
        .run(tauri::generate_context!())
        .expect(
            "error while running the Project Amadeus application",
        );
}