# Progressive Disclosure of Agent Tools from the Perspective of CLI Tool Style

It has been nearly two months since Anthropic released [Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills). In this release, Anthropic mentioned a term: Progressive Disclosure. What exactly is this? What problem does it solve?

Actually, in my Vibe Coding workflow, I rarely use MCP. The reason is that I find the implementation quality of MCP to be inconsistent. At its core, it’s about context injection (the essence of tools is also context injection), and I’m not sure if prompts written by others might affect my workflow, so I simply avoid using it altogether. The current implementation of MCP essentially wraps all functionalities as tools exposed to the Agent (one functionality wrapped as one tool, given a detailed description, telling the agent when to call it and what the parameter format is). This has led to the current explosion of prompts.

It wasn’t until Anthropic released Skills and I looked into it that I realized its essence is still prompt injection. If MCP provides a specification for injecting tools, then what Skills advocates is somewhat "unconventional." Skills provides a Markdown document to describe the purpose and best practices of the skill, along with some attached scripts (different from MCP).
![image](https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F6f22d8913dbc6228e7f11a41e0b3c124d817b6d2-1650x929.jpg&w=3840&q=75)

Since these scripts run directly on the user’s local machine, there are significant security risks. If users cannot review the script code, it can easily lead to serious security issues such as data leakage or virus infections. Compared to MCP, which provides a standardized interface, Skills offer a series of script files. Different skills may have different types of script files—for example, some scripts are implemented in Node.js, while others use Python. To use these scripts, users also need to install the corresponding runtime and dependencies. This is why I describe it as "unconventional."


Is this really the best practice?

Regarding Progressive Disclosure, here is how Anthropic describes it:
> Progressive disclosure is the core design principle that makes Agent Skills flexible and scalable. Like a well-organized manual that starts with a table of contents, then specific chapters, and finally a detailed appendix, skills let Claude load information only as needed:
> ![image](https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fa3bca2763d7892982a59c28aa4df7993aaae55ae-2292x673.jpg&w=3840&q=75)
> Agents with a filesystem and code execution tools don’t need to read the entirety of a skill into their context window when working on a particular task. This means that the amount of context that can be bundled into a skill is effectively unbounded.

The following diagram shows how the context window changes when a skill is triggered by a user’s message.
![image](https://www.anthropic.com/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F441b9f6cc0d2337913c1f41b05357f16f51f702e-1650x929.jpg&w=3840&q=75)

Do we really need to implement it this way?

In our daily use of CLI tools, most CLI tools come with a `--help` parameter for viewing the tool's usage and instructions. Isn't that essentially the tool's user manual? For example:
```shell
> npm --help
npm <command>

Usage:

npm install        install all the dependencies in your project
npm install <foo>  add the <foo> dependency to your project
npm test           run this project's tests
npm run <foo>      run the script named <foo>
npm <command> -h   quick help on <command>
npm -l             display usage info for all commands
npm help <term>    search for help on <term>
npm help npm       more involved overview

All commands:

    access, adduser, audit, bugs, cache, ci, completion,
    config, dedupe, deprecate, diff, dist-tag, docs, doctor,
    edit, exec, explain, explore, find-dupes, fund, get, help,
    help-search, hook, init, install, install-ci-test,
    install-test, link, ll, login, logout, ls, org, outdated,
    owner, pack, ping, pkg, prefix, profile, prune, publish,
    query, rebuild, repo, restart, root, run-script, sbom,
    search, set, shrinkwrap, star, stars, start, stop, team,
    test, token, uninstall, unpublish, unstar, update, version,
    view, whoami

Specify configs in the ini-formatted file:
    /Users/xxx/.npmrc
or on the command line via: npm <command> --key=value

More configuration info: npm help config
Configuration fields: npm help 7 config
```

This manual doesn't return every possible usage of every command either. It only lists which commands are available and what functions they can perform. For the specific usage of a command, you can still obtain it by using the `--help` parameter:
```shell
> npm install --help
Install a package

Usage:
npm install [<package-spec> ...]

Options:
[-S|--save|--no-save|--save-prod|--save-dev|--save-optional|--save-peer|--save-bundle]
[-E|--save-exact] [-g|--global]
[--install-strategy <hoisted|nested|shallow|linked>] [--legacy-bundling]
[--global-style] [--omit <dev|optional|peer> [--omit <dev|optional|peer> ...]]
[--include <prod|dev|optional|peer> [--include <prod|dev|optional|peer> ...]]
[--strict-peer-deps] [--prefer-dedupe] [--no-package-lock] [--package-lock-only]
[--foreground-scripts] [--ignore-scripts] [--no-audit] [--no-bin-links]
[--no-fund] [--dry-run] [--cpu <cpu>] [--os <os>] [--libc <libc>]
[-w|--workspace <workspace-name> [-w|--workspace <workspace-name> ...]]
[-ws|--workspaces] [--include-workspace-root] [--install-links]

aliases: add, i, in, ins, inst, insta, instal, isnt, isnta, isntal, isntall

Run "npm help install" for more info
```
Doesn't this resemble the definition of progressive disclosure mentioned above?

Can we implement an MCP in this style to achieve progressive disclosure of tools without needing skills? I used Codex to convert the official PDF Skill into an MCP, exposing only a single tool:
```json
{
    "name": "mcp__pdf__pdf",
    "description": "Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms. When Claude needs to fill in a PDF form or programmatically process, generate, or analyze PDF documents at scale.You need to pass in the --help parameter to obtain the usage of this tool first.",
    "input_schema": {
        "type": "object",
        "properties": {
            "params": {
                "$ref": "#/$defs/PdfCommandInput"
            }
        },
        "required": [
            "params"
        ],
        "$defs": {
            "PdfCommandInput": {
                "additionalProperties": false,
                "properties": {
                    "argv": {
                        "description": "Command tokens excluding the leading 'pdf' executable name",
                        "items": {
                            "type": "string"
                        },
                        "title": "Argv",
                        "type": "array"
                    },
                    "command": {
                        "anyOf": [
                            {
                                "type": "string"
                            },
                            {
                                "type": "null"
                            }
                        ],
                        "default": null,
                        "description": "Optional command string; if set, it will be split like a shell",
                        "title": "Command"
                    }
                },
                "title": "PdfCommandInput",
                "type": "object"
            }
        },
        "title": "pdfArguments"
    }
}
```

Below is the change in the context window when using this MCP:
```json
User: Extract all the text from test.pdf and write it into result.txt
Agent: Tool(name="pdf", args=["--help"])
Tool: pdf - Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms. When Claude needs to fill in a PDF form or programmatically process, generate, or analyze PDF documents at scale在使用之前你需要先传入--help参数以获取该工具的用法\n\nUsage:\n  pdf [--help] <domain> <command> [options]\n\nDomains:\n  forms      Fill, extract, and validate PDF form fields.\n  documents  Create, merge, and split PDFs.\n  text       Extract text content from PDFs.\n  tables     Extract tables (heuristic, whitespace-based).\n  images     Render PDF pages to PNG images.\n\nRun `pdf <domain> --help` for domain help.\nRun `pdf <domain> <command> --help` for command help.
Agent: Tool(name="pdf", args=["text", "--help"])
Tool: text - Extract text content from PDFs.\n\nUsage:\n  pdf text <command> [options]\n\nCommands:\n  extract  Extract text content from a PDF.\n\nRun `pdf text <command> --help` for details.
Agent: Tool(name="pdf", args=["text", "extract", "--help"])
Tool: usage: pdf text extract --pdf PDF_PATH [--pages PAGES] [--out OUTPUT_PATH]\n                        [--format {text,json}] [--overwrite]\n\nExtract text content from a PDF.\n\noptions:\n  --pdf PDF_PATH        Input PDF\n  --pages PAGES         Page selection like 1,3-5 or 'all' (default: all)\n  --out OUTPUT_PATH     Write extracted text to a file\n  --format {text,json}  Output format (default: text)\n  --overwrite           Overwrite output file if it exists\n
Agent: Tool(name="pdf", args=["text", "extract", "--pdf", "test.pdf", "--out", "result.txt", "--overwrite"])
Tool: {"result": {"stdout": "xx","data": {"pdf_path": "test.pdf","page_count": 6,"pages": [xxx],"format": "text","output_path": "result.txt"}}}
Agent: xxx
```

From the perspective of context changes, progressive disclosure has been fully realized. This MCP code is open-source (entirely written by Codex, serving only to validate the idea without any review): https://github.com/musistudio/pdf-skill-mcp 

If you have any thoughts or ideas, I’d also welcome the opportunity to discuss them with you. email: [m@musiiot.top](mailto://m@musiiot.top )
