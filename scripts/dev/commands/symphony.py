"""Symphony orchestration commands."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table

app = typer.Typer(help="Symphony orchestration commands.")
console = Console()

ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / "WORKFLOW.md"
LOCAL_ENV = ROOT / ".env.symphony.local"
DEFAULT_SYMPHONY_DIR = Path("~/code/symphony").expanduser()
SYMPHONY_REPO_URL = "https://github.com/openai/symphony"
GUARDRAILS_ACK_FLAG = "--i-understand-that-this-will-be-running-without-the-usual-guardrails"

load_dotenv(LOCAL_ENV)


def _is_set(name: str) -> bool:
    return bool(os.environ.get(name))


def _exists(path: Path) -> bool:
    return path.exists()


def _check(label: str, ok: bool, detail: str) -> tuple[str, str, str]:
    return (label, "ok" if ok else "missing", detail)


def _symphony_binary(symphony_dir: Path) -> Path:
    return symphony_dir.expanduser() / "elixir" / "bin" / "symphony"


def _print_checks(rows: list[tuple[str, str, str]]) -> None:
    table = Table(title="Symphony setup")
    table.add_column("Check", style="cyan")
    table.add_column("Status")
    table.add_column("Detail")

    for label, status, detail in rows:
        style = "green" if status == "ok" else "yellow"
        table.add_row(label, f"[{style}]{status}[/{style}]", detail)

    console.print(table)


@app.command("doctor")
def doctor(
    symphony_dir: Path = typer.Option(
        DEFAULT_SYMPHONY_DIR,
        "--symphony-dir",
        envvar="SYMPHONY_DIR",
        help="Path to a local openai/symphony checkout.",
    ),
) -> None:
    """Check the local prerequisites for running Symphony against Mizan."""
    symphony_dir = symphony_dir.expanduser()
    binary = _symphony_binary(symphony_dir)
    rows = [
        _check("Workflow", _exists(WORKFLOW), str(WORKFLOW)),
        _check("Codex CLI", shutil.which("codex") is not None, "required for app-server"),
        _check("Git CLI", shutil.which("git") is not None, "required for workspace cloning"),
        _check("GitHub CLI", shutil.which("gh") is not None, "required for PR handoff"),
        _check("mise", shutil.which("mise") is not None, "recommended by Symphony Elixir"),
        _check("Linear API key", _is_set("LINEAR_API_KEY"), "LINEAR_API_KEY"),
        _check("Symphony checkout", _exists(symphony_dir), str(symphony_dir)),
        _check("Symphony binary", _exists(binary), str(binary)),
    ]
    _print_checks(rows)

    missing_labels = {label for label, status, _ in rows if status != "ok"}
    if missing_labels:
        console.print()
        if missing_labels & {"mise", "Symphony checkout", "Symphony binary"}:
            console.print("[bold]Install reference implementation[/bold]")
            console.print(f"git clone {SYMPHONY_REPO_URL} {symphony_dir}")
            console.print(f"cd {symphony_dir / 'elixir'}")
            console.print("mise trust")
            console.print("mise install")
            console.print("mise exec -- mix setup")
            console.print("mise exec -- mix build")
        if missing_labels & {"Linear API key"}:
            console.print("[bold]Set Linear environment[/bold]")
            console.print(f"Create {LOCAL_ENV} with:")
            console.print("LINEAR_API_KEY=...")
        raise typer.Exit(code=1)


@app.command("run")
def run(
    symphony_dir: Path = typer.Option(
        DEFAULT_SYMPHONY_DIR,
        "--symphony-dir",
        envvar="SYMPHONY_DIR",
        help="Path to a local openai/symphony checkout.",
    ),
    port: int | None = typer.Option(
        None,
        "--port",
        help="Optional Phoenix dashboard port.",
    ),
    logs_root: Path | None = typer.Option(
        None,
        "--logs-root",
        help="Optional Symphony logs directory.",
    ),
) -> None:
    """Run the Symphony reference implementation with Mizan's workflow."""
    symphony_dir = symphony_dir.expanduser()
    binary = _symphony_binary(symphony_dir)
    elixir_dir = binary.parents[1]

    missing: list[str] = []
    if not WORKFLOW.exists():
        missing.append(f"workflow file: {WORKFLOW}")
    if shutil.which("codex") is None:
        missing.append("codex CLI")
    if not _is_set("LINEAR_API_KEY"):
        missing.append("LINEAR_API_KEY")
    if not binary.exists():
        missing.append(f"Symphony binary: {binary}")

    if missing:
        for item in missing:
            console.print(f"[yellow]Missing {item}[/yellow]")
        console.print("Run [bold cyan]dev symphony doctor[/bold cyan] for setup details.")
        raise typer.Exit(code=1)

    command: list[str] = []
    if shutil.which("mise") is not None:
        command.extend(["mise", "exec", "--"])
    command.extend([str(binary), GUARDRAILS_ACK_FLAG])

    if logs_root is not None:
        command.extend(["--logs-root", str(logs_root.expanduser())])
    if port is not None:
        command.extend(["--port", str(port)])
    command.append(str(WORKFLOW))

    console.print("[bold cyan]Starting Symphony[/bold cyan]")
    console.print(f"Workflow: {WORKFLOW}")
    console.print(f"Runtime:  {symphony_dir}")
    if port is not None:
        console.print(f"Dashboard: http://localhost:{port}")

    result = subprocess.run(command, cwd=str(elixir_dir), env=os.environ.copy())
    raise typer.Exit(code=result.returncode)
