use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const LOCAL_USER_ID: &str = "local-default";
const CONVERSATION_FILE_NAME: &str = "conversations.json";

const OLLAMA_TAGS_URL: &str =
    "http://127.0.0.1:11434/api/tags";

const OLLAMA_CHAT_URL: &str =
    "http://127.0.0.1:11434/api/chat";

const OLLAMA_PULL_URL: &str =
    "http://127.0.0.1:11434/api/pull";

const OLLAMA_INSTALLER_URL: &str =
    "https://ollama.com/download/OllamaSetup.exe";

const AMADEUS_MODEL_NAME: &str =
    "amadeus-kurisu";

const AMADEUS_MODEL_TAG: &str =
    "amadeus-kurisu:latest";

const BASE_MODEL_NAME: &str =
    "llama3.1:8b";

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Default)]
struct OllamaStreamState {
    requests: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaSystemStatus {
    status: String,
    ollama_online: bool,
    model_available: bool,
}

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    models: Option<Vec<OllamaModel>>,
}

#[derive(Debug, Deserialize)]
struct OllamaModel {
    name: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct OllamaChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaChatMessage>,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct OllamaStreamResponse {
    message: Option<OllamaStreamMessage>,
    done: Option<bool>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OllamaStreamMessage {
    content: Option<String>,
}

#[derive(Debug, Serialize)]
struct OllamaPullRequest {
    model: String,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct OllamaPullResponse {
    status: Option<String>,
    error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "event",
    content = "data"
)]
enum OllamaStreamEvent {
    Token { token: String },
}

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
    if let Ok(local_app_data) =
        env::var("LOCALAPPDATA")
    {
        let installed_path =
            PathBuf::from(local_app_data)
                .join("Programs")
                .join("Ollama")
                .join("ollama.exe");

        if installed_path.exists() {
            return Some(installed_path);
        }
    }

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
        String::from_utf8_lossy(&output.stderr)
            .trim()
            .to_string();

    let stdout =
        String::from_utf8_lossy(&output.stdout)
            .trim()
            .to_string();

    let details = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        "The command exited without additional details."
            .to_string()
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

fn model_is_available(
    models: Option<Vec<OllamaModel>>,
) -> bool {
    models
        .unwrap_or_default()
        .iter()
        .any(|model| {
            model.name == AMADEUS_MODEL_NAME
                || model.name == AMADEUS_MODEL_TAG
        })
}

async fn fetch_ollama_status() -> OllamaSystemStatus {
    let client = match reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(client) => client,
        Err(_) => {
            return OllamaSystemStatus {
                status: "offline".to_string(),
                ollama_online: false,
                model_available: false,
            };
        }
    };

    let response = match client
        .get(OLLAMA_TAGS_URL)
        .send()
        .await
    {
        Ok(response)
            if response.status().is_success() =>
        {
            response
        }

        _ => {
            return OllamaSystemStatus {
                status: "offline".to_string(),
                ollama_online: false,
                model_available: false,
            };
        }
    };

    let tags = match response
        .json::<OllamaTagsResponse>()
        .await
    {
        Ok(tags) => tags,

        Err(_) => {
            return OllamaSystemStatus {
                status: "offline".to_string(),
                ollama_online: false,
                model_available: false,
            };
        }
    };

    let model_available =
        model_is_available(tags.models);

    OllamaSystemStatus {
        status: if model_available {
            "ready".to_string()
        } else {
            "model-missing".to_string()
        },
        ollama_online: true,
        model_available,
    }
}

async fn pull_base_model() -> Result<(), String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60 * 60))
        .build()
        .map_err(|error| {
            format!(
                "Unable to initialize the Ollama model download client: {error}"
            )
        })?;

    let request = OllamaPullRequest {
        model: BASE_MODEL_NAME.to_string(),
        stream: false,
    };

    let response = client
        .post(OLLAMA_PULL_URL)
        .json(&request)
        .send()
        .await
        .map_err(|error| {
            if error.is_connect() {
                "Unable to connect to Ollama while downloading the base model."
                    .to_string()
            } else if error.is_timeout() {
                "The base model download timed out. Retry to resume the download."
                    .to_string()
            } else {
                format!(
                    "Unable to download the base model: {error}"
                )
            }
        })?;

    let status_code = response.status();

    let response_text = response
        .text()
        .await
        .map_err(|error| {
            format!(
                "Unable to read the Ollama model download response: {error}"
            )
        })?;

    if !status_code.is_success() {
        if response_text.trim().is_empty() {
            return Err(format!(
                "Ollama returned HTTP {status_code} while downloading {BASE_MODEL_NAME}."
            ));
        }

        return Err(response_text.trim().to_string());
    }

    let pull_response =
        serde_json::from_str::<OllamaPullResponse>(
            &response_text,
        )
        .map_err(|error| {
            format!(
                "Ollama returned an invalid model download response: {error}"
            )
        })?;

    if let Some(error) = pull_response.error {
        return Err(format!(
            "Ollama could not download {BASE_MODEL_NAME}: {error}"
        ));
    }

    if pull_response.status.as_deref()
        != Some("success")
    {
        return Err(format!(
            "Ollama did not confirm that {BASE_MODEL_NAME} downloaded successfully."
        ));
    }

    Ok(())
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

    fs::read_to_string(&file_path)
        .map(Some)
        .map_err(|error| {
            format!(
                "Unable to read conversation history: {error}"
            )
        })
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

    fs::create_dir_all(parent_directory)
        .map_err(|error| {
            format!(
                "Unable to create the conversation data directory: {error}"
            )
        })?;

    serde_json::from_str::<serde_json::Value>(
        &conversation_store_json,
    )
    .map_err(|error| {
        format!(
            "Conversation history contains invalid JSON: {error}"
        )
    })?;

    fs::write(
        &file_path,
        conversation_store_json,
    )
    .map_err(|error| {
        format!(
            "Unable to save conversation history: {error}"
        )
    })
}

#[tauri::command]
async fn check_ollama_system_status(
) -> OllamaSystemStatus {
    fetch_ollama_status().await
}

#[tauri::command]
async fn is_ollama_installed(
) -> Result<bool, String> {
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
    #[cfg(not(target_os = "windows"))]
    {
        return Err(
            "Automatic Ollama installation is currently supported only on Windows."
                .to_string(),
        );
    }

    #[cfg(target_os = "windows")]
    {
        if get_ollama_executable_path().is_some() {
            return Ok(
                "Ollama is already installed."
                    .to_string(),
            );
        }

        let temporary_directory =
            env::temp_dir()
                .join("ProjectAmadeus");

        fs::create_dir_all(
            &temporary_directory,
        )
        .map_err(|error| {
            format!(
                "Unable to create the temporary installer directory: {error}"
            )
        })?;

        let installer_path =
            temporary_directory
                .join("OllamaSetup.exe");

        let client =
            reqwest::Client::builder()
                .connect_timeout(
                    Duration::from_secs(15),
                )
                .timeout(
                    Duration::from_secs(
                        15 * 60,
                    ),
                )
                .build()
                .map_err(|error| {
                    format!(
                        "Unable to initialize the Ollama installer download: {error}"
                    )
                })?;

        let response = client
            .get(OLLAMA_INSTALLER_URL)
            .send()
            .await
            .map_err(|error| {
                if error.is_connect() {
                    "Unable to connect to the Ollama download server."
                        .to_string()
                } else if error.is_timeout() {
                    "The Ollama installer download timed out."
                        .to_string()
                } else {
                    format!(
                        "Unable to download the Ollama installer: {error}"
                    )
                }
            })?;

        if !response.status().is_success() {
            return Err(format!(
                "The Ollama download server returned HTTP {}.",
                response.status()
            ));
        }

        let installer_bytes =
            response
                .bytes()
                .await
                .map_err(|error| {
                    format!(
                        "Unable to read the downloaded Ollama installer: {error}"
                    )
                })?;

        if installer_bytes.is_empty() {
            return Err(
                "The downloaded Ollama installer was empty."
                    .to_string(),
            );
        }

        fs::write(
            &installer_path,
            &installer_bytes,
        )
        .map_err(|error| {
            format!(
                "Unable to save the Ollama installer: {error}"
            )
        })?;

        // Do not use CREATE_NO_WINDOW here.
        // The official installer should remain visible
        // so the user can review and complete it.
        let installer_status =
            tauri::async_runtime::spawn_blocking({
                let installer_path =
                    installer_path.clone();

                move || {
                    Command::new(
                        &installer_path,
                    )
                    .status()
                    .map_err(|error| {
                        format!(
                            "Unable to launch the Ollama installer: {error}"
                        )
                    })
                }
            })
            .await
            .map_err(|error| {
                format!(
                    "The Ollama installer process failed: {error}"
                )
            })??;

        if !installer_status.success() {
            let exit_code =
                installer_status
                    .code()
                    .map(|code| {
                        code.to_string()
                    })
                    .unwrap_or_else(|| {
                        "unknown".to_string()
                    });

            return Err(format!(
                "The Ollama installer closed without completing successfully. Exit code: {exit_code}."
            ));
        }

        // The installer may finish before Windows has
        // fully written the application files.
        for _ in 0..30 {
            if get_ollama_executable_path()
                .is_some()
            {
                let _ =
                    fs::remove_file(
                        &installer_path,
                    );

                return Ok(
                    "Ollama installation completed successfully."
                        .to_string(),
                );
            }

            tokio::time::sleep(
                Duration::from_secs(1),
            )
            .await;
        }

        Err(
            "The Ollama installer finished, but Amadeus could not locate the installed application. Restart Amadeus and retry the system check."
                .to_string(),
        )
    }
}

#[tauri::command]
async fn start_ollama() -> Result<String, String> {
    let executable =
        get_ollama_executable_path()
            .ok_or_else(|| {
                "Ollama is not installed or could not be located."
                    .to_string()
            })?;

    tauri::async_runtime::spawn_blocking(
        move || {
            let mut command =
                Command::new(&executable);

            command
                .arg("serve")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());

            #[cfg(target_os = "windows")]
            command.creation_flags(
                CREATE_NO_WINDOW,
            );

            command.spawn().map_err(|error| {
                format!(
                    "Unable to start the Ollama service: {error}"
                )
            })?;

            Ok::<(), String>(())
        },
    )
    .await
    .map_err(|error| {
        format!(
            "The Ollama startup task failed: {error}"
        )
    })??;

    for _ in 0..20 {
        let status =
            fetch_ollama_status().await;

        if status.ollama_online {
            return Ok(
                "Ollama was started."
                    .to_string(),
            );
        }

        tokio::time::sleep(
            Duration::from_millis(500),
        )
        .await;
    }

    Err(
        "Ollama started, but its local API did not become available within 10 seconds."
            .to_string(),
    )
}

#[tauri::command]
async fn create_amadeus_model(
    app: AppHandle,
) -> Result<String, String> {
    let modelfile_path =
        resolve_modelfile_path(&app)?;

    pull_base_model()
        .await
        .map_err(|error| {
            format!(
                "Downloading the base Llama model failed: {error}"
            )
        })?;

    tauri::async_runtime::spawn_blocking(
        move || {
            let executable =
                get_ollama_executable_path()
                    .ok_or_else(|| {
                        "Ollama is not installed or could not be located."
                            .to_string()
                    })?;

            let modelfile =
                modelfile_path
                    .to_string_lossy()
                    .to_string();

            let create_output =
                run_command_and_capture(
                    executable.as_path(),
                    &[
                        "create",
                        AMADEUS_MODEL_NAME,
                        "-f",
                        &modelfile,
                    ],
                )?;

            if !create_output.status.success() {
                return Err(
                    format_command_failure(
                        "Creating the Amadeus model",
                        &create_output,
                    ),
                );
            }

            Ok(
                "The amadeus-kurisu model was created successfully."
                    .to_string(),
            )
        },
    )
    .await
    .map_err(|error| {
        format!(
            "The Amadeus model creation task failed: {error}"
        )
    })?
}

#[tauri::command]
fn cancel_ollama_stream(
    request_id: String,
    state: State<'_, OllamaStreamState>,
) -> Result<(), String> {
    let requests =
        state.requests.lock().map_err(|_| {
            "Unable to access the Ollama stream state."
                .to_string()
        })?;

    if let Some(cancelled) =
        requests.get(&request_id)
    {
        cancelled.store(
            true,
            Ordering::SeqCst,
        );
    }

    Ok(())
}

#[tauri::command]
async fn stream_ollama_message(
    request_id: String,
    messages: Vec<OllamaChatMessage>,
    on_event: Channel<OllamaStreamEvent>,
    state: State<'_, OllamaStreamState>,
) -> Result<(), String> {
    let cancelled =
        Arc::new(AtomicBool::new(false));

    {
        let mut requests =
            state.requests.lock().map_err(
                |_| {
                    "Unable to register the Ollama request."
                        .to_string()
                },
            )?;

        requests.insert(
            request_id.clone(),
            cancelled.clone(),
        );
    }

    let result =
        stream_ollama_message_inner(
            messages,
            on_event,
            cancelled,
        )
        .await;

    if let Ok(mut requests) =
        state.requests.lock()
    {
        requests.remove(&request_id);
    }

    result
}

async fn stream_ollama_message_inner(
    messages: Vec<OllamaChatMessage>,
    on_event: Channel<OllamaStreamEvent>,
    cancelled: Arc<AtomicBool>,
) -> Result<(), String> {
    let client =
        reqwest::Client::builder()
            .connect_timeout(
                Duration::from_secs(15),
            )
            .build()
            .map_err(|error| {
                format!(
                    "Unable to initialize the Ollama client: {error}"
                )
            })?;

    let request = OllamaChatRequest {
        model:
            AMADEUS_MODEL_NAME.to_string(),
        messages,
        stream: true,
    };

    let response = client
        .post(OLLAMA_CHAT_URL)
        .json(&request)
        .send()
        .await
        .map_err(|error| {
            if error.is_connect() {
                "OFFLINE: Unable to connect to Ollama."
                    .to_string()
            } else if error.is_timeout() {
                "TIMEOUT: Ollama did not respond in time."
                    .to_string()
            } else {
                format!(
                    "REQUEST_FAILED: Unable to send the Ollama request: {error}"
                )
            }
        })?;

    if !response.status().is_success() {
        let status = response.status();

        let body = response
            .text()
            .await
            .unwrap_or_default();

        let normalized_body =
            body.to_lowercase();

        if status.as_u16() == 404
            || (
                normalized_body
                    .contains("model")
                && normalized_body
                    .contains("not found")
            )
        {
            return Err(format!(
                "MODEL_MISSING: The required model \"{AMADEUS_MODEL_NAME}\" was not found."
            ));
        }

        return Err(format!(
            "REQUEST_FAILED: Ollama returned HTTP {status}: {body}"
        ));
    }

    let mut stream =
        response.bytes_stream();

    let mut buffer = String::new();
    let mut received_content = false;
    let mut received_done = false;

    while let Some(chunk_result) =
        stream.next().await
    {
        if cancelled.load(Ordering::SeqCst) {
            return Err(
                "ABORTED".to_string(),
            );
        }

        let chunk =
            chunk_result.map_err(|error| {
                format!(
                    "STREAM_INTERRUPTED: The Ollama stream failed: {error}"
                )
            })?;

        buffer.push_str(
            &String::from_utf8_lossy(&chunk),
        );

        while let Some(newline_index) =
            buffer.find('\n')
        {
            let line = buffer
                [..newline_index]
                .trim()
                .to_string();

            buffer.drain(..=newline_index);

            if line.is_empty() {
                continue;
            }

            let parsed =
                serde_json::from_str::<
                    OllamaStreamResponse,
                >(&line)
                .map_err(|error| {
                    format!(
                        "MALFORMED_STREAM: Ollama returned invalid stream data: {error}"
                    )
                })?;

            if let Some(error) =
                parsed.error
            {
                return Err(format!(
                    "REQUEST_FAILED: {error}"
                ));
            }

            if let Some(token) =
                parsed.message.and_then(
                    |message| {
                        message.content
                    },
                )
            {
                if !token.is_empty() {
                    received_content = true;

                    on_event
                        .send(
                            OllamaStreamEvent::Token {
                                token,
                            },
                        )
                        .map_err(|error| {
                            format!(
                                "Unable to send an Ollama token to the interface: {error}"
                            )
                        })?;
                }
            }

            if parsed.done.unwrap_or(false) {
                received_done = true;
                break;
            }
        }

        if received_done {
            break;
        }
    }

    if cancelled.load(Ordering::SeqCst) {
        return Err("ABORTED".to_string());
    }

    if !received_done {
        return Err(
            "STREAM_INTERRUPTED: The Ollama response ended before completion."
                .to_string(),
        );
    }

    if !received_content {
        return Err(
            "EMPTY_RESPONSE: Ollama completed without returning response text."
                .to_string(),
        );
    }

    Ok(())
}

#[cfg_attr(
    mobile,
    tauri::mobile_entry_point
)]
pub fn run() {
    tauri::Builder::default()
        .manage(
            OllamaStreamState::default(),
        )
        .plugin(
            tauri_plugin_opener::init(),
        )
        .invoke_handler(
            tauri::generate_handler![
                load_conversation_store,
                save_conversation_store,
                check_ollama_system_status,
                is_ollama_installed,
                install_ollama,
                start_ollama,
                create_amadeus_model,
                cancel_ollama_stream,
                stream_ollama_message
            ],
        )
        .run(
            tauri::generate_context!(),
        )
        .expect(
            "error while running the Project Amadeus application",
        );
}