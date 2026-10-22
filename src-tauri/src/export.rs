//! File output for CyberFacade: PNG / EXR encoding and plain file IO.
//!
//! Pixel data arrives as a raw IPC body (no JSON/base64 round trip); metadata
//! travels in headers. Encoding runs on a blocking worker thread so the UI and
//! the GPU preview never stall during export.

use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;

use exr::prelude::{f16, AnyChannel, AnyChannels, Blocks, Compression, Encoding, FlatSamples, Image, Layer, LayerAttributes, LineOrder, WritableImage};
use tauri::ipc::{InvokeBody, Request};

fn header(req: &Request<'_>, name: &str) -> Result<String, String> {
    let v = req
        .headers()
        .get(name)
        .ok_or_else(|| format!("missing header {name}"))?
        .to_str()
        .map_err(|e| e.to_string())?;
    // Paths are percent-encoded by the frontend so any Unicode path survives HTTP headers.
    percent_decode(v)
}

fn percent_decode(s: &str) -> Result<String, String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).map_err(|e| e.to_string())?;
            out.push(u8::from_str_radix(hex, 16).map_err(|e| e.to_string())?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|e| e.to_string())
}

fn raw_body(req: &Request<'_>) -> Result<Vec<u8>, String> {
    match req.body() {
        InvokeBody::Raw(data) => Ok(data.clone()),
        _ => Err("expected a raw binary body".into()),
    }
}

fn ensure_parent(path: &PathBuf) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    Ok(())
}

/// Headers: x-path, x-format (png8 | png16 | exr), x-width, x-height, x-channels (1 | 3 | 4).
/// Body: interleaved samples — u8 for png8, f16 (LE bits) for png16/exr.
#[tauri::command]
pub async fn write_image(request: Request<'_>) -> Result<(), String> {
    let path = PathBuf::from(header(&request, "x-path")?);
    let format = header(&request, "x-format")?;
    let width: usize = header(&request, "x-width")?.parse().map_err(|_| "bad width")?;
    let height: usize = header(&request, "x-height")?.parse().map_err(|_| "bad height")?;
    let channels: usize = header(&request, "x-channels")?.parse().map_err(|_| "bad channels")?;
    let data = raw_body(&request)?;

    tauri::async_runtime::spawn_blocking(move || {
        ensure_parent(&path)?;
        match format.as_str() {
            "png8" => write_png8(&path, width, height, channels, &data),
            "exr" => write_exr(&path, width, height, channels, &data),
            other => Err(format!("unknown image format {other}")),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn write_png8(path: &PathBuf, w: usize, h: usize, channels: usize, data: &[u8]) -> Result<(), String> {
    if data.len() != w * h * channels {
        return Err(format!("png: expected {} bytes, got {}", w * h * channels, data.len()));
    }
    let file = File::create(path).map_err(|e| format!("create {}: {e}", path.display()))?;
    let mut enc = png::Encoder::new(BufWriter::new(file), w as u32, h as u32);
    enc.set_color(match channels {
        1 => png::ColorType::Grayscale,
        3 => png::ColorType::Rgb,
        _ => png::ColorType::Rgba,
    });
    enc.set_depth(png::BitDepth::Eight);
    enc.set_compression(png::Compression::Fast);
    // sRGB tag: color PNGs are display-encoded; masks are linear 0–1 values either way.
    enc.set_source_srgb(png::SrgbRenderingIntent::Perceptual);
    let mut writer = enc.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(data).map_err(|e| e.to_string())?;
    writer.finish().map_err(|e| e.to_string())
}

/// Half-float EXR, ZIP compressed, scanlines. Channels: 1 → Y, 3 → RGB, 4 → RGBA.
fn write_exr(path: &PathBuf, w: usize, h: usize, channels: usize, data: &[u8]) -> Result<(), String> {
    let expected = w * h * channels * 2;
    if data.len() != expected {
        return Err(format!("exr: expected {expected} bytes, got {}", data.len()));
    }
    let names: &[&str] = match channels {
        1 => &["Y"],
        3 => &["R", "G", "B"],
        4 => &["R", "G", "B", "A"],
        n => return Err(format!("exr: unsupported channel count {n}")),
    };

    // De-interleave into one plane per channel.
    let mut planes: Vec<Vec<f16>> = (0..channels).map(|_| Vec::with_capacity(w * h)).collect();
    for px in data.chunks_exact(channels * 2) {
        for (c, plane) in planes.iter_mut().enumerate() {
            plane.push(f16::from_bits(u16::from_le_bytes([px[c * 2], px[c * 2 + 1]])));
        }
    }

    let list: Vec<AnyChannel<FlatSamples>> = names
        .iter()
        .zip(planes)
        .map(|(name, plane)| AnyChannel::new(*name, FlatSamples::F16(plane)))
        .collect();
    let channels = AnyChannels::sort(list.into());

    let encoding = Encoding {
        compression: Compression::ZIP16,
        blocks: Blocks::ScanLines,
        line_order: LineOrder::Increasing,
    };
    let layer = Layer::new((w, h), LayerAttributes::default(), encoding, channels);
    Image::from_layer(layer)
        .write()
        .to_file(path)
        .map_err(|e| format!("exr {}: {e}", path.display()))
}

/// Headers: x-path. Body: raw bytes (video files, project/preset JSON).
#[tauri::command]
pub async fn write_file(request: Request<'_>) -> Result<(), String> {
    let path = PathBuf::from(header(&request, "x-path")?);
    let data = raw_body(&request)?;
    tauri::async_runtime::spawn_blocking(move || {
        ensure_parent(&path)?;
        std::fs::write(&path, data).map_err(|e| format!("write {}: {e}", path.display()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("read {path}: {e}"))
}

/// Raw file bytes (imported media next to a project) as a binary IPC response.
#[tauri::command]
pub async fn read_file(path: String) -> Result<tauri::ipc::Response, String> {
    let data = tauri::async_runtime::spawn_blocking(move || std::fs::read(&path).map_err(|e| format!("read {path}: {e}")))
        .await
        .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(data))
}

/// Size of a file in bytes, or None if it does not exist.
#[tauri::command]
pub async fn file_size(path: String) -> Result<Option<u64>, String> {
    Ok(std::fs::metadata(&path).ok().filter(|m| m.is_file()).map(|m| m.len()))
}

/// Whether a file or folder exists at `path`.
#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}

#[tauri::command]
pub async fn ensure_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("create {path}: {e}"))
}
