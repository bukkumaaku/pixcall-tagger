fn main() -> Result<(), ai_worker::WorkerError> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if !args
        .iter()
        .any(|argument| argument == "--http" || argument == "--detach-http")
    {
        return ai_worker::run_stdio();
    }

    let port = argument_value(&args, "--port")
        .unwrap_or("22514")
        .parse::<u16>()
        .map_err(|error| ai_worker::WorkerError::Arguments(error.to_string()))?;
    let token = argument_value(&args, "--token")
        .unwrap_or("pixcall-ai-tagger-v4")
        .to_string();
    let host_port = argument_value(&args, "--host-port")
        .map(str::parse::<u16>)
        .transpose()
        .map_err(|error| ai_worker::WorkerError::Arguments(error.to_string()))?;
    if args.iter().any(|argument| argument == "--detach-http") {
        ai_worker::spawn_detached_http(port, token, host_port)
    } else {
        ai_worker::run_http(port, token, host_port)
    }
}

fn argument_value<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| pair[1].as_str())
}
