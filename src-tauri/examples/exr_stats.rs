//! Dev tool: decode an exported EXR and print per-channel statistics.
//! `cargo run --example exr_stats -- path/to/file.exr`

use exr::prelude::{read_all_flat_layers_from_file, FlatSamples};

fn main() {
    let path = std::env::args().nth(1).expect("usage: exr_stats <file.exr>");
    let image = read_all_flat_layers_from_file(&path).expect("failed to read EXR");
    for layer in &image.layer_data {
        println!("layer {}x{}, compression {:?}", layer.size.width(), layer.size.height(), layer.encoding.compression);
        for ch in &layer.channel_data.list {
            let values: Vec<f32> = match &ch.sample_data {
                FlatSamples::F16(v) => v.iter().map(|x| x.to_f32()).collect(),
                FlatSamples::F32(v) => v.clone(),
                FlatSamples::U32(v) => v.iter().map(|&x| x as f32).collect(),
            };
            let max = values.iter().cloned().fold(f32::MIN, f32::max);
            let mean = values.iter().sum::<f32>() / values.len() as f32;
            let over1 = values.iter().filter(|&&v| v > 1.0).count();
            println!("  {:>2}: max {:8.3}  mean {:6.4}  >1.0: {:.2}%", ch.name, max, mean, 100.0 * over1 as f32 / values.len() as f32);
        }
    }
}
