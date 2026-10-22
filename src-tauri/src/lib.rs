mod export;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            export::write_image,
            export::write_file,
            export::read_text_file,
            export::read_file,
            export::file_size,
            export::path_exists,
            export::ensure_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CyberFacade");
}
