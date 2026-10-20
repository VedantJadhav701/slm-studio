"""Allow `python -m slmstudio` to run the CLI."""

import sys

from .cli import main

if __name__ == "__main__":
    sys.exit(main())
