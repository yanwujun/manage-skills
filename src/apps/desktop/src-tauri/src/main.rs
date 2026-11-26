#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::{Manager, State};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FsEntry {
    name: String,
    is_file: bool,
    is_directory: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileStat {
    size: u64,
    mtime_ms: u64,
    is_file: bool,
    is_directory: bool,
    is_symlink: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WslDistro {
    name: String,
    reachable: bool,
}

struct AppState {
    allowed_roots: Mutex<Vec<PathBuf>>,
}

fn home_dir() -> PathBuf {
    std::env::var("MANAGE_SKILLS_HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn default_roots(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join(".claude"),
        home.join(".cursor"),
        home.join(".codex"),
        home.join(".hermes"),
        home.join(".manage-skills"),
        PathBuf::from("\\\\wsl$"),
    ]
}

impl AppState {
    fn allowed(&self, path: &Path) -> bool {
        let roots = self.allowed_roots.lock().unwrap();
        roots.iter().any(|root| path.starts_with(root))
    }

    fn allow(&self, path: PathBuf) {
        self.allowed_roots.lock().unwrap().push(path);
    }
}

#[tauri::command]
fn app_paths() -> serde_json::Value {
    let home = home_dir();
    serde_json::json!({
        "home": home.to_string_lossy(),
        "manageSkillsDir": home.join(".manage-skills").to_string_lossy(),
        "index": home.join(".manage-skills").join("index.json").to_string_lossy(),
        "similarity": home.join(".manage-skills").join("similarity.json").to_string_lossy(),
        "history": home.join(".manage-skills").join("history.jsonl").to_string_lossy(),
    })
}

#[tauri::command]
fn allow_root(path: String, state: State<AppState>) -> Result<(), String> {
    let candidate = PathBuf::from(&path);
    if !candidate.exists() {
        return Err(format!("路径不存在：{}", path));
    }
    let canonical = fs::canonicalize(&candidate).unwrap_or(candidate);
    state.allow(canonical);
    Ok(())
}

#[tauri::command]
fn read_dir(path: String, state: State<AppState>) -> Result<Vec<FsEntry>, String> {
    let target = PathBuf::from(&path);
    if !state.allowed(&target) {
        return Err(format!("路径未授权：{}", path));
    }
    let entries = fs::read_dir(&target).map_err(|error| error.to_string())?;
    let mut result = Vec::new();
    for entry in entries.flatten() {
        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        result.push(FsEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            is_file: file_type.is_file(),
            is_directory: file_type.is_dir(),
        });
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

#[tauri::command]
fn read_text_file(path: String, state: State<AppState>) -> Result<String, String> {
    let target = PathBuf::from(&path);
    if !state.allowed(&target) {
        return Err(format!("路径未授权：{}", path));
    }
    fs::read_to_string(&target).map_err(|error| error.to_string())
}

#[tauri::command]
fn stat(path: String, state: State<AppState>) -> Result<Option<FileStat>, String> {
    let target = PathBuf::from(&path);
    if !state.allowed(&target) {
        return Err(format!("路径未授权：{}", path));
    }
    match fs::symlink_metadata(&target) {
        Ok(meta) => Ok(Some(FileStat {
            size: meta.len(),
            mtime_ms: meta
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as u64)
                .unwrap_or(0),
            is_file: meta.file_type().is_file(),
            is_directory: meta.file_type().is_dir(),
            is_symlink: meta.file_type().is_symlink(),
        })),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
fn list_wsl_distros() -> Vec<WslDistro> {
    let mut result = Vec::new();
    if let Ok(entries) = fs::read_dir("\\\\wsl$") {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let reachable = entry.path().is_dir();
            result.push(WslDistro { name, reachable });
        }
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    result
}

#[tauri::command]
fn write_text_file_atomic(
    path: String,
    content: String,
    state: State<AppState>,
) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !state.allowed(&target) {
        return Err(format!("路径未授权：{}", path));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let tmp = target.with_file_name(format!(
        ".{}.tmp-{}",
        target
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".to_string()),
        std::process::id()
    ));
    fs::write(&tmp, content).map_err(|error| error.to_string())?;
    fs::rename(&tmp, &target).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn create_dir(path: String, state: State<AppState>) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !state.allowed(&target) {
        return Err(format!("路径未授权：{}", path));
    }
    fs::create_dir_all(&target).map_err(|error| error.to_string())
}

#[tauri::command]
fn copy_file(from: String, to: String, state: State<AppState>) -> Result<(), String> {
    let source = PathBuf::from(&from);
    let target = PathBuf::from(&to);
    if !state.allowed(&source) || !state.allowed(&target) {
        return Err("路径未授权".to_string());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::copy(&source, &target).map(|_| ()).map_err(|error| error.to_string())
}

#[tauri::command]
fn remove_file(path: String, state: State<AppState>) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !state.allowed(&target) {
        return Err(format!("路径未授权：{}", path));
    }
    match fs::remove_file(&target) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn main() {
    let home = home_dir();
    let state = AppState {
        allowed_roots: Mutex::new(default_roots(&home)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            app_paths,
            allow_root,
            read_dir,
            read_text_file,
            stat,
            list_wsl_distros,
            write_text_file_atomic,
            create_dir,
            copy_file,
            remove_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_roots_allow_known_agent_dirs() {
        let home = PathBuf::from("C:\\Users\\dev");
        let state = AppState {
            allowed_roots: Mutex::new(default_roots(&home)),
        };
        assert!(state.allowed(&home.join(".claude").join("skills")));
        assert!(state.allowed(&home.join(".cursor").join("skills")));
        assert!(state.allowed(&home.join(".manage-skills").join("index.json")));
    }

    #[test]
    fn rejects_unauthorized_path() {
        let home = PathBuf::from("C:\\Users\\dev");
        let state = AppState {
            allowed_roots: Mutex::new(default_roots(&home)),
        };
        assert!(!state.allowed(Path::new("C:\\Windows\\System32")));
        assert!(!state.allowed(Path::new("D:\\other")));
    }

    #[test]
    fn allow_adds_new_root() {
        let state = AppState {
            allowed_roots: Mutex::new(vec![]),
        };
        assert!(!state.allowed(Path::new("D:\\data\\skills")));
        state.allow(PathBuf::from("D:\\data\\skills"));
        assert!(state.allowed(Path::new("D:\\data\\skills\\foo\\SKILL.md")));
    }
}