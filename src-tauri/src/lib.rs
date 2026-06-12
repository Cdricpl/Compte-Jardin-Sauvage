use std::path::PathBuf;
use tauri::Manager;

/// Retourne le chemin complet vers un fichier dans le dossier de données de l'application.
/// Sur Windows : C:\Users\<user>\AppData\Roaming\EDD-Compta\<name>
fn data_file(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

/// Lit le fichier de données principal (compta.json).
/// Renvoie None si le fichier n'existe pas encore (première ouverture).
#[tauri::command]
fn read_data(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = data_file(&app, "compta.json")?;
    if path.exists() {
        Ok(Some(std::fs::read_to_string(&path).map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}

/// Écrit les données comptables dans compta.json.
#[tauri::command]
fn write_data(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = data_file(&app, "compta.json")?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

/// Lit le fichier des instantanés (15 derniers états).
#[tauri::command]
fn read_snapshots(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = data_file(&app, "snapshots.json")?;
    if path.exists() {
        Ok(Some(std::fs::read_to_string(&path).map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}

/// Écrit le fichier des instantanés.
#[tauri::command]
fn write_snapshots(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = data_file(&app, "snapshots.json")?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

/// Renvoie le chemin du dossier de données (pour info dans les Paramètres).
#[tauri::command]
fn get_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_data,
            write_data,
            read_snapshots,
            write_snapshots,
            get_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du démarrage de l'application");
}
