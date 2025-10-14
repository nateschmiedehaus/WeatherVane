{
  "snippets": [
    {
      "codeTitle": "New Prefect Quickstart Guide",
      "codeDescription": "A new quickstart guide has been introduced to help new users get started with Prefect quickly. This guide covers the initial setup and basic usage.",
      "codeLanguage": "English",
      "codeTokens": 0,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/release-notes/oss/version-3-4.mdx#_snippet_74",
      "pageTitle": "Unknown",
      "codeList": [],
      "relevance": 0.033333335,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Start Prefect Open Source Server",
      "codeDescription": "Starts a local Prefect server for managing workflows. This command is used for Prefect Open Source installations and makes the server accessible at http://localhost:4200.",
      "codeLanguage": "bash",
      "codeTokens": 57,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/get-started/quickstart.mdx#_snippet_7",
      "pageTitle": "Prefect Quickstart",
      "codeList": [
        {
          "language": "bash",
          "code": "prefect server start"
        }
      ],
      "relevance": 0.03201844,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Add Detail to GitHub Quickstart",
      "codeDescription": "Enhances the GitHub Quickstart guide with more detailed instructions and options for setting up Prefect.",
      "codeLanguage": "Markdown",
      "codeTokens": 87,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/release-notes/oss/version-3-4.mdx#_snippet_42",
      "pageTitle": "Unknown",
      "codeList": [
        {
          "language": "Markdown",
          "code": "Add detail and options to the GitHub Quickstart by [@kevingrismore](https://github.com/kevingrismore) in [#18621](https://github.com/PrefectHQ/prefect/pull/18621)"
        }
      ],
      "relevance": 0.031099323,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Prefect Home Documentation Links",
      "codeDescription": "Provides links to the Prefect getting started guide, CLI reference, API documentation, and Helm chart repository.",
      "codeLanguage": "javascript",
      "codeTokens": 128,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/snippets/resource-management/vars.mdx#_snippet_0",
      "pageTitle": "Prefect Documentation Links",
      "codeList": [
        {
          "language": "javascript",
          "code": "export const home = {\n    tf: \"https://registry.terraform.io/providers/PrefectHQ/prefect/latest/docs/guides/getting-started\",\n    cli: \"https://docs.prefect.io/v3/api-ref/cli/index\",\n    api: \"https://app.prefect.cloud/api/docs\",\n    helm: \"https://github.com/PrefectHQ/prefect-helm/tree/main/charts\",\n}"
        }
      ],
      "relevance": 0.031054404,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Prefect Server CLI Deployment",
      "codeDescription": "This snippet demonstrates how to start a local Prefect server instance using the Prefect CLI. It assumes Prefect is installed and configured.",
      "codeLanguage": "Bash",
      "codeTokens": 54,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/concepts/server.mdx#_snippet_0",
      "pageTitle": "Prefect Server Self-Hosting Guide",
      "codeList": [
        {
          "language": "Bash",
          "code": "prefect server start"
        }
      ],
      "relevance": 0.03036577,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Prefect CLI Work Queue Creation Output",
      "codeDescription": "Example output for creating a Prefect work queue via the CLI. It includes details of the created queue and suggested next steps like starting an agent or inspecting the queue.",
      "codeLanguage": "javascript",
      "codeTokens": 153,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/contribute/styles-practices.mdx#_snippet_12",
      "pageTitle": "Prefect Code and Development Style Guide",
      "codeList": [
        {
          "language": "javascript",
          "code": "$ prefect work-queue create testing\n\nCreated work queue with properties:\n    name - 'abcde'\n    uuid - 940f9828-c820-4148-9526-ea8107082bda\n    tags - None\n    deployment_ids - None\n\nStart an agent to pick up flows from the created work queue:\n    prefect agent start -q 'abcde'\n\nInspect the created work queue:\n    prefect work-queue inspect 'abcde'"
        }
      ],
      "relevance": 0.027673192,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Install Prefect Cloud and Login",
      "codeDescription": "This bash script installs the `uv` package manager and then uses `uvx` to install and run the `prefect-cloud` login command. This process is used to create or log in to a Prefect Cloud account.",
      "codeLanguage": "bash",
      "codeTokens": 108,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/get-started/quickstart.mdx#_snippet_1",
      "pageTitle": "Prefect Quickstart",
      "codeList": [
        {
          "language": "bash",
          "code": "curl -LsSf https://astral.sh/uv/install.sh | sh # Install `uv`.\nuvx prefect-cloud login # Installs `prefect-cloud` into a temporary virtual env."
        }
      ],
      "relevance": 0.027289378,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Code Example",
      "codeDescription": "Returns a code example for a given block. It attempts to parse the example from the class docstring if no override is provided.",
      "codeLanguage": "Python",
      "codeTokens": 56,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/api-ref/python/prefect-filesystems.mdx#_snippet_11",
      "pageTitle": "Prefect Filesystems",
      "codeList": [
        {
          "language": "Python",
          "code": "get_code_example(cls) -> Optional[str]"
        }
      ],
      "relevance": 0.025693893,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Install Project Dependencies",
      "codeDescription": "Installs all necessary dependencies for the project using npm. This command ensures that all packages listed in `package.json` are downloaded and installed in the `node_modules` directory.",
      "codeLanguage": "bash",
      "codeTokens": 61,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/ui-v2/README.md#_snippet_0",
      "pageTitle": "Prefect UI Project Setup and Configuration",
      "codeList": [
        {
          "language": "bash",
          "code": "npm ci"
        }
      ],
      "relevance": 0.025166191,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Start Development Server",
      "codeDescription": "Compiles the project and starts a development server with hot-reloading. This command is used during development to quickly see changes as they are made.",
      "codeLanguage": "bash",
      "codeTokens": 56,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/ui-v2/README.md#_snippet_1",
      "pageTitle": "Prefect UI Project Setup and Configuration",
      "codeList": [
        {
          "language": "bash",
          "code": "npm run dev"
        }
      ],
      "relevance": 0.024641577,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Start Storybook",
      "codeDescription": "Launches the Storybook development server, typically at http://localhost:6006. This allows for interactive development and documentation of UI components.",
      "codeLanguage": "bash",
      "codeTokens": 56,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/ui-v2/README.md#_snippet_6",
      "pageTitle": "Prefect UI Project Setup and Configuration",
      "codeList": [
        {
          "language": "bash",
          "code": "npm run storybook"
        }
      ],
      "relevance": 0.024585478,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Docker Compose Setup Documentation (Markdown)",
      "codeDescription": "Provides official documentation for setting up Prefect using Docker Compose. This guide simplifies the deployment and management of Prefect in containerized environments.",
      "codeLanguage": "Markdown",
      "codeTokens": 267,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/release-notes/oss/version-3-4.mdx#_snippet_53",
      "pageTitle": "Unknown",
      "codeList": [
        {
          "language": "markdown",
          "code": "```markdown\n# Official Prefect Docker Compose Setup\n\nThis guide outlines the steps to set up Prefect using Docker Compose.\n\n## Prerequisites\n\n* Docker installed and running\n* Docker Compose installed\n\n## Steps\n\n1.  **Clone the Prefect repository** (if not already done):\n    ```bash\n    git clone https://github.com/PrefectHQ/prefect.git\n    cd prefect\n    ```\n\n2.  **Navigate to the Docker Compose directory**:\n    ```bash\n    cd docs/examples/docker-compose\n    ```\n\n3.  **Start the Prefect services**:\n    ```bash\n    docker-compose up -d\n    ```\n\n4.  **Access the Prefect UI**:\n    Open your web browser and navigate to `http://localhost:4200`.\n\n## Configuration\n\nEnvironment variables in the `docker-compose.yml` file can be used to configure Prefect, such as database connections and API keys.\n\n## Stopping Prefect\n\nTo stop the Prefect services:\n\n```bash\ndocker-compose down\n```\n```"
        }
      ],
      "relevance": 0.023608316,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Start Prefect Workers on Windows",
      "codeDescription": "Demonstrates starting Prefect workers on Windows using PowerShell. It includes examples for starting a process worker and a Docker worker, highlighting the flexibility in execution environments.",
      "codeLanguage": "powershell",
      "codeTokens": 114,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/how-to-guides/self-hosted/server-windows.mdx#_snippet_4",
      "pageTitle": "How to run Prefect on Windows",
      "codeList": [
        {
          "language": "powershell",
          "code": "# Run flows as Windows processes\nprefect worker start --pool my-process-pool --type process\n\n# Use Windows containers with Docker Desktop\ndocker pull mcr.microsoft.com/windows/servercore:ltsc2019\nprefect worker start --pool my-docker-pool --type docker"
        }
      ],
      "relevance": 0.02229613,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Start Prefect Server with Docker",
      "codeDescription": "Starts a Prefect server using a Docker container, exposing the server on port 4200. This is an alternative for users who prefer running Prefect in a containerized environment.",
      "codeLanguage": "bash",
      "codeTokens": 95,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/get-started/quickstart.mdx#_snippet_8",
      "pageTitle": "Prefect Quickstart",
      "codeList": [
        {
          "language": "bash",
          "code": "docker run -p 4200:4200 -d --rm prefecthq/prefect:3-python3.12 prefect server start --host 0.0.0.0"
        }
      ],
      "relevance": 0.021749409,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Prefect Code Example",
      "codeDescription": "Fetches the code example for a given Prefect block class. It attempts to parse the example from the class docstring if no specific override is provided.",
      "codeLanguage": "Python",
      "codeTokens": 61,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/api-ref/python/prefect-filesystems.mdx#_snippet_59",
      "pageTitle": "Prefect Filesystems",
      "codeList": [
        {
          "language": "Python",
          "code": "get_code_example(cls) -> Optional[str]"
        }
      ],
      "relevance": 0.021640826,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Prefect Code Example",
      "codeDescription": "Returns a code example for a given Prefect block. It attempts to parse the example from the class docstring if no specific override is provided.",
      "codeLanguage": "Python",
      "codeTokens": 59,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/api-ref/python/prefect-filesystems.mdx#_snippet_82",
      "pageTitle": "Prefect Filesystems",
      "codeList": [
        {
          "language": "Python",
          "code": "get_code_example(cls) -> Optional[str]"
        }
      ],
      "relevance": 0.021437198,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Start IPython with Prefect using uvx",
      "codeDescription": "Launches an IPython shell with Python 3.12 and the Prefect package pre-installed, utilizing the uvx command for environment management.",
      "codeLanguage": "bash",
      "codeTokens": 63,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/get-started/install.mdx#_snippet_1",
      "pageTitle": "Install Prefect",
      "codeList": [
        {
          "language": "bash",
          "code": "uvx --python 3.12 --with prefect ipython"
        }
      ],
      "relevance": 0.021109637,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Run Prefect Server with uvx",
      "codeDescription": "Starts the Prefect server in an ephemeral Python environment managed by uvx, providing a quick way to run the server for testing or development.",
      "codeLanguage": "bash",
      "codeTokens": 54,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/get-started/install.mdx#_snippet_4",
      "pageTitle": "Install Prefect",
      "codeList": [
        {
          "language": "bash",
          "code": "uvx prefect server start"
        }
      ],
      "relevance": 0.02070943,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Code Example for Block",
      "codeDescription": "Returns a code example for a given block. It attempts to parse the example from the class docstring if no specific override is provided.",
      "codeLanguage": "Python",
      "codeTokens": 58,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/api-ref/python/prefect-blocks-system.mdx#_snippet_80",
      "pageTitle": "Prefect Blocks System Documentation",
      "codeList": [
        {
          "language": "Python",
          "code": "get_code_example(cls) -> Optional[str]"
        }
      ],
      "relevance": 0.020691637,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Makefile for Project Setup",
      "codeDescription": "This Makefile automates the setup process for the Prefect and Modal project. It includes tasks for installing `uv`, creating a virtual environment, locking dependencies, and synchronizing the project environment.",
      "codeLanguage": "Makefile",
      "codeTokens": 214,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/how-to-guides/deployment_infra/modal.mdx#_snippet_0",
      "pageTitle": "How to run Prefect flows on Modal",
      "codeList": [
        {
          "language": "makefile",
          "code": "export PYTHONPATH = .venv\n\n.PHONY: uv\nuv:\n  pip install --upgrade 'uv>=0.5.6,<0.6'\n  uv venv\n\nsetup:\n  @if [ ! -d \".venv\" ] || ! command -v uv > /dev/null; then \\\n    echo \"UV not installed or .venv does not exist, running uv\"; \\\n    make uv; \\\n  fi\n  @if [ ! -f \"uv.lock\" ]; then \\\n    echo \"Can't find lockfile. Locking\"; \\\n    uv lock; \\\n  fi\n  uv sync --all-extras --all-groups\n  uv pip install --no-deps -e .\n"
        }
      ],
      "relevance": 0.020517677,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Code Example for Block",
      "codeDescription": "Returns a code example for a given block. It attempts to parse the example from the class docstring if no specific override is provided.",
      "codeLanguage": "Python",
      "codeTokens": 58,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/api-ref/python/prefect-blocks-system.mdx#_snippet_33",
      "pageTitle": "Prefect Blocks System Documentation",
      "codeList": [
        {
          "language": "Python",
          "code": "get_code_example(cls) -> Optional[str]"
        }
      ],
      "relevance": 0.01988294,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Install Prefect-Client",
      "codeDescription": "Installs the minimal Prefect client library, which is designed for interacting with Prefect Cloud or remote Prefect server instances. This is a lightweight alternative to the full Prefect installation.",
      "codeLanguage": "bash",
      "codeTokens": 63,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/get-started/install.mdx#_snippet_6",
      "pageTitle": "Install Prefect",
      "codeList": [
        {
          "language": "bash",
          "code": "pip install -U prefect-client"
        }
      ],
      "relevance": 0.019414986,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Add Documentation for Prefect Cloud GitHub App",
      "codeDescription": "Provides documentation for the Prefect Cloud GitHub application, guiding users on its setup and usage.",
      "codeLanguage": "Python",
      "codeTokens": 45,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/release-notes/oss/version-3-4.mdx#_snippet_145",
      "pageTitle": "Unknown",
      "codeList": [
        {
          "language": "Python",
          "code": "add_documentation_prefect_cloud_github_app"
        }
      ],
      "relevance": 0.019334953,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Code Example for Block (Python)",
      "codeDescription": "Fetches a code example for a specified block class. It attempts to parse the example from the class's docstring if no explicit override is provided, aiding in understanding block usage.",
      "codeLanguage": "Python",
      "codeTokens": 66,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/api-ref/python/prefect-filesystems.mdx#_snippet_35",
      "pageTitle": "Prefect Filesystems",
      "codeList": [
        {
          "language": "Python",
          "code": "get_code_example(cls) -> Optional[str]"
        }
      ],
      "relevance": 0.019283503,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Start Prefect development server with hot-reloading",
      "codeDescription": "Starts all Prefect services with hot-reloading enabled for code changes. This requires the installation of UI dependencies.",
      "codeLanguage": "bash",
      "codeTokens": 46,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/contribute/dev-contribute.mdx#_snippet_12",
      "pageTitle": "Develop on Prefect",
      "codeList": [
        {
          "language": "bash",
          "code": "prefect dev start"
        }
      ],
      "relevance": 0.018944744,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Start Prefect Runner - Python",
      "codeDescription": "Starts the Prefect runner, enabling it to monitor and execute scheduled flows. Optionally, it can run once and start a webserver. The example demonstrates initializing a runner, adding flows with and without schedules, and running the start method.",
      "codeLanguage": "Python",
      "codeTokens": 266,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/api-ref/python/prefect-runner-runner.mdx#_snippet_10",
      "pageTitle": "Prefect Runner Documentation",
      "codeList": [
        {
          "language": "Python",
          "code": "start(self, run_once: bool = False, webserver: Optional[bool] = None) -> None"
        },
        {
          "language": "Python",
          "code": "import asyncio\nfrom prefect import flow, Runner\n\n@flow\ndef hello_flow(name):\n    print(f\"hello {name}\")\n\n@flow\ndef goodbye_flow(name):\n    print(f\"goodbye {name}\")\n\nif __name__ == \"__main__\"\n    runner = Runner(name=\"my-runner\")\n\n    # Will be runnable via the API\n    runner.add_flow(hello_flow)\n\n    # Run on a cron schedule\n    runner.add_flow(goodbye_flow, schedule={\"cron\": \"0 * * * *\"})\n\n    asyncio.run(runner.start())"
        }
      ],
      "relevance": 0.018480647,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Prefect CLI Work Queue Creation Placeholder Example",
      "codeDescription": "Illustrates how to create a Prefect work queue with optional tags using placeholders for user-defined values.",
      "codeLanguage": "javascript",
      "codeTokens": 72,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/contribute/styles-practices.mdx#_snippet_13",
      "pageTitle": "Prefect Code and Development Style Guide",
      "codeList": [
        {
          "language": "javascript",
          "code": "prefect work-queue create '<WORK QUEUE NAME>' -t '<OPTIONAL TAG 1>' -t '<OPTIONAL TAG 2>'"
        }
      ],
      "relevance": 0.01818332,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Install Prefect with uv",
      "codeDescription": "Installs Prefect in an editable version using `uv` for dependency management. This is recommended for quick iteration during development.",
      "codeLanguage": "bash",
      "codeTokens": 48,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/contribute/dev-contribute.mdx#_snippet_0",
      "pageTitle": "Develop on Prefect",
      "codeList": [
        {
          "language": "bash",
          "code": "uv sync"
        }
      ],
      "relevance": 0.016659407,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Code Example for Block (Python)",
      "codeDescription": "Fetches a code example for a specified block class. It attempts to parse the example from the class's docstring if no explicit override is provided, aiding in understanding block usage.",
      "codeLanguage": "Python",
      "codeTokens": 67,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/api-ref/python/prefect-blocks-system.mdx#_snippet_11",
      "pageTitle": "Prefect Blocks System Documentation",
      "codeList": [
        {
          "language": "Python",
          "code": "get_code_example(cls) -> Optional[str]"
        }
      ],
      "relevance": 0.016314132,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Run API-Ref Generation with New Examples Syntax",
      "codeDescription": "The API reference generation process has been updated to incorporate a new syntax for examples. This ensures that the generated API documentation accurately reflects the latest code examples.",
      "codeLanguage": "English",
      "codeTokens": 0,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/release-notes/oss/version-3-4.mdx#_snippet_69",
      "pageTitle": "Unknown",
      "codeList": [],
      "relevance": 0.01630816,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Synchronous Prefect Client",
      "codeDescription": "Illustrates how to obtain and use a synchronous Prefect client as a context manager. This example also performs a 'hello' call and prints the JSON response.",
      "codeLanguage": "python",
      "codeTokens": 88,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/advanced/api-client.mdx#_snippet_1",
      "pageTitle": "How to use and configure the API client",
      "codeList": [
        {
          "language": "python",
          "code": "from prefect import get_client\n\nwith get_client(sync_client=True) as client:\n    response = client.hello()\n    print(response.json()) # 👋"
        }
      ],
      "relevance": 0.016179338,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Prefect Flow Execution Logs",
      "codeDescription": "This snippet displays the typical output logs from a Prefect flow execution. It shows the start of the flow run, the URL to view the execution graph in Prefect Cloud, and the completion status of individual tasks and the overall flow.",
      "codeLanguage": "bash",
      "codeTokens": 447,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/get-started/quickstart.mdx#_snippet_3",
      "pageTitle": "Prefect Quickstart",
      "codeList": [
        {
          "language": "bash",
          "code": "00:30:53.633 | INFO    | Flow run 'airborne-ringtail' - Beginning flow run 'airborne-ringtail' for flow 'main'\n00:30:53.638 | INFO    | Flow run 'airborne-ringtail' - View at https://app.prefect.cloud/account/...\n00:30:53.685 | INFO    | Task run 'get_customer_ids-136' - Finished in state Completed()\n00:30:54.512 | INFO    | Task run 'process_customer-d9b' - Finished in state Completed()\n00:30:54.518 | INFO    | Task run 'process_customer-113' - Finished in state Completed()\n00:30:54.519 | INFO    | Task run 'process_customer-1c6' - Finished in state Completed()\n00:30:54.519 | INFO    | Task run 'process_customer-30d' - Finished in state Completed()\n00:30:54.520 | INFO    | Task run 'process_customer-eaa' - Finished in state Completed()\n00:30:54.523 | INFO    | Task run 'process_customer-b2b' - Finished in state Completed()\n00:30:54.523 | INFO    | Task run 'process_customer-90a' - Finished in state Completed()\n00:30:54.524 | INFO    | Task run 'process_customer-4af' - Finished in state Completed()\n00:30:54.524 | INFO    | Task run 'process_customer-e66' - Finished in state Completed()\n00:30:54.526 | INFO    | Task run 'process_customer-e7e' - Finished in state Completed()\n00:30:54.527 | INFO    | Flow run 'airborne-ringtail' - Finished in state Completed('All states completed.')"
        }
      ],
      "relevance": 0.016166884,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Code Example for Block (Python)",
      "codeDescription": "Fetches a code example for a specified block class. It attempts to parse the example from the class's docstring if no explicit override is provided, aiding in understanding block usage.",
      "codeLanguage": "Python",
      "codeTokens": 67,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/api-ref/python/prefect-blocks-system.mdx#_snippet_57",
      "pageTitle": "Prefect Blocks System Documentation",
      "codeList": [
        {
          "language": "Python",
          "code": "get_code_example(cls) -> Optional[str]"
        }
      ],
      "relevance": 0.016145416,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Clone Repository and Run Prefect Flow",
      "codeDescription": "This bash command clones the Prefect quickstart repository, navigates into the directory, and then executes the Python script `01_getting_started.py` using `uv run`. This command initiates the local execution of the Prefect flow.",
      "codeLanguage": "bash",
      "codeTokens": 95,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/get-started/quickstart.mdx#_snippet_2",
      "pageTitle": "Prefect Quickstart",
      "codeList": [
        {
          "language": "bash",
          "code": "git clone https://github.com/PrefectHQ/quickstart && cd quickstart\nuv run 01_getting_started.py"
        }
      ],
      "relevance": 0.016129032,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Install Prefect with Docker support",
      "codeDescription": "Installs a version of prefect-docker compatible with your Prefect installation. If Prefect is not installed, it installs the latest version.",
      "codeLanguage": "bash",
      "codeTokens": 59,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/integrations/prefect-docker/index.mdx#_snippet_0",
      "pageTitle": "Prefect Docker Installation and Usage",
      "codeList": [
        {
          "language": "bash",
          "code": "pip install \"prefect[docker]\""
        }
      ],
      "relevance": 0.016064517,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Update Quickstart Tutorial and Documentation",
      "codeDescription": "Several updates have been made to the quickstart tutorial and general documentation to improve clarity, accuracy, and user experience. This includes refining the introduction, correcting time estimates, and reorganizing content flow.",
      "codeLanguage": "Markdown",
      "codeTokens": 210,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/release-notes/oss/version-3-1.mdx#_snippet_25",
      "pageTitle": "Prefect Release Notes - 3.1.15",
      "codeList": [
        {
          "language": "Markdown",
          "code": "# Quickstart Tutorial Updates\n\n- Improved introduction to the quickstart tutorial.\n- Removed the promise that the quickstart only takes five minutes to complete.\n- Moved the quickstart to immediately before the 'schedule a flow' tutorial.\n- Used the flow from the quickstart as the basis for the deployment in the scheduling tutorial.\n\n# General Documentation Updates\n\n- Updated intros in Docs.\n- Updated index.mdx.\n- Updated prefect-yaml.mdx.\n- Added state transition table to 'Manage states' doc and linked from the debug tutorial.\n- Added an ML pipeline tutorial.\n- Added documentation for Service Level Agreements.\n- Updated settings docs with basic auth.\n- Published static outbound IP address for managed execution."
        }
      ],
      "relevance": 0.015873017,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Rename Example Links and Add uv run Instructions in Prefect Docs",
      "codeDescription": "This documentation update renames links to examples and adds instructions for using 'uv run' in Prefect, improving the usability of example workflows. This was included in release 3.2.6.",
      "codeLanguage": "Markdown",
      "codeTokens": 76,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/release-notes/oss/version-3-2.mdx#_snippet_95",
      "pageTitle": "Prefect 3.2 Release Notes",
      "codeList": [
        {
          "language": "Markdown",
          "code": "Rename links to examples and add 'uv run' instructions"
        }
      ],
      "relevance": 0.015422987,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Install Prefect with Ray Support",
      "codeDescription": "Installs the `prefect-ray` integration, ensuring compatibility with your Prefect version. If Prefect is not installed, it installs the latest version.",
      "codeLanguage": "bash",
      "codeTokens": 60,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/integrations/prefect-ray/index.mdx#_snippet_0",
      "pageTitle": "Prefect Ray Integration",
      "codeList": [
        {
          "language": "bash",
          "code": "pip install \"prefect[ray]\""
        }
      ],
      "relevance": 0.015257469,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Code Example",
      "codeDescription": "Returns a code example for a given block. It attempts to parse the example from the class docstring if no override is provided.",
      "codeLanguage": "Python",
      "codeTokens": 56,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/api-ref/python/prefect-blocks-abstract.mdx#_snippet_64",
      "pageTitle": "Prefect Blocks Abstract",
      "codeList": [
        {
          "language": "Python",
          "code": "get_code_example(cls) -> Optional[str]"
        }
      ],
      "relevance": 0.015151516,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Code Example",
      "codeDescription": "Returns a code example for a given block. It attempts to parse the example from the class docstring if no override is provided.",
      "codeLanguage": "Python",
      "codeTokens": 56,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/api-ref/python/prefect-blocks-abstract.mdx#_snippet_35",
      "pageTitle": "Prefect Blocks Abstract",
      "codeList": [
        {
          "language": "Python",
          "code": "get_code_example(cls) -> Optional[str]"
        }
      ],
      "relevance": 0.014925373,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Prefect Flow Example",
      "codeDescription": "A simple Prefect flow that uses httpx for making HTTP requests and Prefect's artifact system to create a markdown report based on temperature data.",
      "codeLanguage": "python",
      "codeTokens": 94,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/integrations/prefect-gcp/gcp-worker-guide.mdx#_snippet_10",
      "pageTitle": "Google Cloud Run Worker Guide - Prefect",
      "codeList": [
        {
          "language": "python",
          "code": "import httpx\nfrom prefect import flow, task\nfrom prefect.artifacts import create_markdown_artifact\n\n@task\ndef mark_it_down(temp):\n    markdown_report = f\"# Weather Report\n"
        }
      ],
      "relevance": 0.014800411,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Add How To Run Deployments Doc",
      "codeDescription": "A new 'How To Run Deployments' guide has been added. This documentation provides instructions on deploying and running workflows within Prefect.",
      "codeLanguage": "English",
      "codeTokens": 0,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/release-notes/oss/version-3-4.mdx#_snippet_73",
      "pageTitle": "Unknown",
      "codeList": [],
      "relevance": 0.014705882,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Install Prefect Client",
      "codeDescription": "Installs the prefect-client package using pip. Ensure you are using Python 3.9 or later.",
      "codeLanguage": "bash",
      "codeTokens": 52,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/client/README.md#_snippet_0",
      "pageTitle": "Prefect Client: Interact with Prefect Servers",
      "codeList": [
        {
          "language": "bash",
          "code": "pip install prefect-client"
        }
      ],
      "relevance": 0.014366812,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Block Code Example",
      "codeDescription": "Retrieves a code example for a given block. It attempts to parse the example from the class docstring if no explicit override is provided.",
      "codeLanguage": "Python",
      "codeTokens": 57,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/api-ref/python/prefect-blocks-abstract.mdx#_snippet_151",
      "pageTitle": "Prefect Blocks Abstract",
      "codeList": [
        {
          "language": "Python",
          "code": "get_code_example(cls) -> Optional[str]"
        }
      ],
      "relevance": 0.014285714,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Run Prefect Flow Locally",
      "codeDescription": "Demonstrates how to execute the 'hello' Prefect flow locally. It shows running the flow with default parameters, with custom parameters, and in a loop to greet multiple people, utilizing Prefect's tagging feature for run filtering.",
      "codeLanguage": "Python",
      "codeTokens": 187,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/examples/hello-world.mdx#_snippet_2",
      "pageTitle": "Prefect Hello World Example",
      "codeList": [
        {
          "language": "Python",
          "code": "if __name__ == \"__main__\":\n    # run the flow with default parameters\n    with tags(\n        \"test\"\n    ):  # This is a tag that we can use to filter the flow runs in the UI\n        hello()  # Logs: \"Hello, Marvin!\"\n\n        # run the flow with a different input\n        hello(\"Marvin\")  # Logs: \"Hello, Marvin!\"\n\n        # run the flow multiple times for different people\n        crew = [\"Zaphod\", \"Trillian\", \"Ford\"]\n\n        for name in crew:\n            hello(name)"
        }
      ],
      "relevance": 0.014285714,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Run Prefect Server and Trigger Deployment",
      "codeDescription": "These bash commands are used to execute the Prefect setup. The first command starts the server process to listen for events, and the second command manually triggers a run of the upstream deployment to test the event-driven chaining.",
      "codeLanguage": "bash",
      "codeTokens": 143,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/how-to-guides/automations/chaining-deployments-with-events.mdx#_snippet_1",
      "pageTitle": "How to chain deployments with events",
      "codeList": [
        {
          "language": "bash",
          "code": "python event_driven_deployments.py"
        },
        {
          "language": "bash",
          "code": "prefect deployment run upstream-flow/upstream_deployment"
        }
      ],
      "relevance": 0.014256722,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Get Code Example for Prefect Block",
      "codeDescription": "Retrieves a code example for a Prefect Block. It attempts to parse the example from the class docstring if an override is not provided.",
      "codeLanguage": "Python",
      "codeTokens": 58,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/api-ref/python/prefect-blocks-abstract.mdx#_snippet_125",
      "pageTitle": "Prefect Blocks Abstract",
      "codeList": [
        {
          "language": "Python",
          "code": "get_code_example(cls) -> Optional[str]"
        }
      ],
      "relevance": 0.014084507,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Install Prefect with Bitbucket Integration",
      "codeDescription": "Installs the prefect-bitbucket library, including the necessary extras for Bitbucket integration. It also handles upgrading existing Prefect installations.",
      "codeLanguage": "bash",
      "codeTokens": 111,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/integrations/prefect-bitbucket/index.mdx#_snippet_0",
      "pageTitle": "Prefect Bitbucket Integration",
      "codeList": [
        {
          "language": "bash",
          "code": "pip install \"prefect[bitbucket]\""
        },
        {
          "language": "bash",
          "code": "pip install -U \"prefect[bitbucket]\""
        }
      ],
      "relevance": 0.013873106,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Initialize Project with uv",
      "codeDescription": "Bootstrap a new Python project using the 'uv' package manager and add Prefect and Marvin as dependencies.",
      "codeLanguage": "Bash",
      "codeTokens": 60,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/advanced/background-tasks.mdx#_snippet_0",
      "pageTitle": "Deploy a Web App Powered by Background Tasks with Prefect",
      "codeList": [
        {
          "language": "Bash",
          "code": "uv init --lib foo\nuv add prefect marvin"
        }
      ],
      "relevance": 0.01369863,
      "model": "gemini-2.5-flash-lite"
    },
    {
      "codeTitle": "Connect to GitHub",
      "codeDescription": "Sets up the connection to GitHub for Prefect Cloud integration using the `uvx prefect-cloud github setup` command. This allows Prefect to access GitHub repositories for deployment.",
      "codeLanguage": "bash",
      "codeTokens": 58,
      "codeId": "https://github.com/prefecthq/prefect/blob/main/docs/v3/get-started/github-quickstart.mdx#_snippet_1",
      "pageTitle": "Unknown",
      "codeList": [
        {
          "language": "bash",
          "code": "uvx prefect-cloud github setup"
        }
      ],
      "relevance": 0.013513514,
      "model": "gemini-2.5-flash-lite"
    }
  ],
  "metadata": {
    "authentication": "personal"
  }
}