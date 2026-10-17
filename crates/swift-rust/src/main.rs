use clap::{Parser, Subcommand};
use swift_rust_errors::Result;

#[derive(Parser, Debug)]
#[command(
    name = "swift-rust",
    version,
    about,
    long_about = None,
    after_help = "UI components: add shadcn-style components with the separate `swift-rust-ui` CLI from @swift-rust/ui (e.g. `bunx @swift-rust/ui add button`)."
)]
struct Cli {
    #[arg(long, global = true)]
    cwd: Option<std::path::PathBuf>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    Dev {
        #[arg(short, long, default_value_t = 3000)]
        port: u16,
    },
    Build {
        #[arg(long, value_enum, default_value_t = Mode::Ssr)]
        mode: Mode,
    },
    Start {
        #[arg(short, long, default_value_t = 3000)]
        port: u16,
    },
    Lint,
    Test,
    Info,
}

#[derive(clap::ValueEnum, Clone, Debug)]
enum Mode {
    Ssr,
    SsrWasm,
    SsrHtmx,
    Wasm,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let cli = Cli::parse();

    if let Some(ref dir) = cli.cwd {
        std::env::set_current_dir(dir)?;
    }

    match cli.command {
        Commands::Dev { port } => {
            swift_rust_server::dev_server(port).await?;
        }
        Commands::Build { mode } => {
            let m = match mode {
                Mode::Ssr => swift_rust_core::RenderMode::Ssr,
                Mode::SsrWasm => swift_rust_core::RenderMode::SsrWasm,
                Mode::SsrHtmx => swift_rust_core::RenderMode::SsrHtmx,
                Mode::Wasm => swift_rust_core::RenderMode::Wasm,
            };
            let project_root = std::env::current_dir()?;
            let pipeline =
                swift_rust_build::BuildPipeline::new(swift_rust_build::BuildConfig::default());
            let output = pipeline
                .build(swift_rust_build::BuildInput {
                    project_root: project_root.clone(),
                    mode: m,
                    target: swift_rust_build::BuildTarget::Production,
                })
                .map_err(|e| swift_rust_errors::Error::Server {
                    message: e.to_string(),
                })?;

            let vercel_output = project_root.join(".vercel").join("output");
            swift_rust_build::emit_vercel_config(&output, &vercel_output).map_err(|e| {
                swift_rust_errors::Error::Server {
                    message: e.to_string(),
                }
            })?;
            println!(
                "  ✓ Scanned {} pages and {} assets",
                output.routes.pages.len(),
                output.assets.len()
            );
            println!("  ✓ Emitted .vercel/output/config.json (BOA v3)");
        }
        Commands::Start { port } => {
            swift_rust_server::start(port).await?;
        }
        Commands::Lint => swift_rust_server::lint().await?,
        Commands::Test => swift_rust_server::test().await?,
        Commands::Info => {
            println!("swift-rust {}", env!("CARGO_PKG_VERSION"));
            println!("rendering modes: ssr, ssr-wasm, ssr-htmx, wasm");
        }
    }

    Ok(())
}
