fn main() -> Result<(), ai_worker::WorkerError> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if !args
        .iter()
        .any(|argument| argument == "--http" || argument == "--detach-http")
    {
        return ai_worker::run_stdio();
    }

    let port = argument_value(&args, "--port")
        .unwrap_or("22512")
        .parse::<u16>()
        .map_err(|error| ai_worker::WorkerError::Arguments(error.to_string()))?;
    let token = argument_value(&args, "--token")
        .unwrap_or("pixcall-ai-tagger-v2")
        .to_string();
    if args.iter().any(|argument| argument == "--detach-http") {
        ai_worker::spawn_detached_http(port, token)
    } else {
        ai_worker::run_http(port, token)
    }
}

fn argument_value<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| pair[1].as_str())
}
