"""Child project dev CLI — project-level development commands."""

from __future__ import annotations

import typer

from dev import __version__
from dev.commands import bug, db, deploy, health, infra, release, security, start, symphony

app = typer.Typer(
    name="dev",
    help="Project dev CLI — development commands.",
    no_args_is_help=True,
    pretty_exceptions_enable=False,
    context_settings={"help_option_names": ["-h", "--help"]},
)


def version_callback(value: bool) -> None:
    if value:
        print(f"dev {__version__}")
        raise typer.Exit()


@app.callback()
def main(
    version: bool = typer.Option(
        False, "--version", "-V",
        callback=version_callback,
        is_eager=True,
        help="Show version.",
    ),
) -> None:
    """Project dev CLI — development commands."""


@app.command()
def help(ctx: typer.Context) -> None:
    """Show this help message."""
    parent = ctx.parent
    if parent is not None:
        print(parent.get_help())
    raise typer.Exit()


_HELP_OPTS = {"help_option_names": ["-h", "--help"]}

_groups = [
    (start.app, "start"),
    (db.app, "db"),
    (bug.app, "bug"),
    (deploy.app, "deploy"),
    (release.app, "release"),
    (health.app, "health"),
    (infra.app, "infra"),
    (security.app, "security"),
    (symphony.app, "symphony"),
]

for sub_app, name in _groups:
    sub_app.info.context_settings = _HELP_OPTS

    @sub_app.command("help", hidden=True)
    def _help_cmd(ctx: typer.Context) -> None:
        """Show help for this command group."""
        parent = ctx.parent
        if parent is not None:
            print(parent.get_help())
        raise typer.Exit()

    app.add_typer(sub_app, name=name)
