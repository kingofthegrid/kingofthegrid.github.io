
const floopyData = new Uint8Array(1474560);

var booted_up = false;

function program_built()
{
    $('#play-button').show();
    $('#download-button').show();
}

function update_status(status)
{
    $('.vm-status').hide();
    $('#status-' + status).show();

    if (status === "ok")
    {
        program_built();
    }
    if (status === "progress")
    {
        $('#build-button').hide();
    }
    else
    {
        $('#build-button').show();
    }
}

async function open_tab_await(url) {
    return new Promise((resolve, reject) => {
        const newTab = window.open(url, '_blank');

        if (!newTab) {
            reject(new Error('Failed to open a new tab. Make sure pop-ups are allowed.'));
            return;
        }

        // Wait for the new tab to load
        newTab.onload = () => {
            console.log('New tab loaded!');
            resolve(newTab); // Resolve the Promise with the tab reference
        };
    });
}

function load_emulator()
{
    var emulator = new V86({
        wasm_path: "v86/v86.wasm",
        memory_size: 256 * 1024 * 1024,
        screen_container: document.getElementById("screen_container"),
        bios: { url: "v86/bios/seabios.bin" },
        vga_bios: { url: "v86/bios/vgabios.bin" },
        cdrom: { url: "v86/images/alpine-virt-x86-sdcc.iso" },
        filesystem: {
            baseurl: "v86/9p",
            type: "9p"
        },
        autostart: true,
        bzimage_initrd_from_filesystem: true,
        cmdline: "rw nomodeset console=ttyS0 modules=virtio_pci tsc=reliable",
    });


    emulator.add_listener("emulator-loaded", async function()
    {
        {
            const response = await fetch('fs/build.sh');
            const buffer = await response.arrayBuffer();
            await emulator.create_file('/build.sh', new Uint8Array(buffer));
        }

        {
            const response = await fetch('fs/bot_api.h');
            const buffer = await response.arrayBuffer();
            await emulator.create_file('/bot_api.h', new Uint8Array(buffer));
        }

        {
            const response = await fetch('fs/sdcc-backend.asm');
            const buffer = await response.arrayBuffer();
            await emulator.create_file('/sdcc-backend.asm', new Uint8Array(buffer));
        }

        console.log("Emulator is fully initialized and ready to use.");
    });

    var content = '';

    emulator.add_listener("serial0-output-byte", (byte) =>
    {
        if (!booted_up)
        {
            booted_up = true;
            $('#terminal-window').show();
            $('#build-tools').show();
            $('#boot-disclaimer').hide();
        }

        var char = String.fromCharCode(byte);
        if(char === "\r")
        {
            return;
        }

        content += char;

        if (char === '\n')
        {
            const ansiEscapeRegex = /\x1b\[[0-9;]*[A-Za-z]/g;
            const data = content.replace(ansiEscapeRegex, "");
            content = '';

            if (data.startsWith('STATUS|'))
            {
                const statusRegex = /STATUS\|(.+)/;
                const match = data.match(statusRegex);
                const status = match[1];
                update_status(status);
                return;
            }

            const term = document.getElementById("terminal");
            term.textContent += data;
            term.scrollTop = term.scrollHeight;
        }
    });

    return emulator;
}

$(function()
{
    // Configure the AMD loader for Monaco
    require.config({ paths: { 'vs': 'vs' } });

    // Load Monaco Editor
    require(['vs/editor/editor.main'], function () {
        const editor = monaco.editor.create(document.getElementById('editor-container'), {
            value: [
                '#include <stdio.h>',
                '#include "bot_api.h"',
                'int main() {',
                '    printf("Hello, World!\\n");',
                '    bot_move_down();',
                '    return 0;',
                '}'
            ].join('\n'), // Preloaded C code
            language: 'c', // Set language to C
            theme: 'vs-dark', // Options: 'vs', 'vs-dark', 'hc-black'
            automaticLayout: true // Auto resize when container size changes
        });

        // Register a completion provider for C
        monaco.languages.registerCompletionItemProvider('c', {
            provideCompletionItems: function (model, position) {
                // Get the word at the current cursor position
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn
                };

                // Return a list of suggestions
                return {
                    suggestions: [
                        {
                            label: 'printf',
                            kind: monaco.languages.CompletionItemKind.Function,
                            documentation: 'Prints formatted output to stdout',
                            insertText: 'printf("${1:format}");',
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            range: range
                        },
                        {
                            label: 'scanf',
                            kind: monaco.languages.CompletionItemKind.Function,
                            documentation: 'Reads formatted input from stdin',
                            insertText: 'scanf("${1:format}", &${2:variable});',
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            range: range
                        },
                        {
                            label: 'return',
                            kind: monaco.languages.CompletionItemKind.Keyword,
                            documentation: 'Exit from a function',
                            insertText: 'return ${1:0};',
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            range: range
                        }
                    ]
                };
            }
        });

        // Access the editor instance for additional functionality
        window.myEditor = editor;
    });

    const emulator = load_emulator();

    $('#build-button').click(async () =>{
        const model = window.myEditor.getModel();
        if (!model) {
            console.error('No model is attached to the editor.');
        }

        {
            const buffer = new TextEncoder().encode(model.getValue());
            await emulator.create_file('/main.c', new Uint8Array(buffer));
        }

        await emulator.serial0_send('/bin/sh /work/build.sh\n');
    });

    $('#play-button').click(async () => {
        const result = await emulator.read_file('/build.bin');
        const runTab = await open_tab_await('../run.html');
        runTab.postMessage(result, window.location.origin);
    });

    $('#download-button').click(async () => {
        const result = await emulator.read_file('/build.bin');

        var a = document.createElement("a");
        a.download = "devbot.bin";
        a.href = window.URL.createObjectURL(new Blob([result]));
        a.dataset.downloadurl = "application/octet-stream:" + a.download + ":" + a.href;
        a.click();
    });

    document.getElementById("save_file").onclick = async function()
    {
        const new_state = await emulator.save_state();
        var a = document.createElement("a");
        a.download = "v86state.bin";
        a.href = window.URL.createObjectURL(new Blob([new_state]));
        a.dataset.downloadurl = "application/octet-stream:" + a.download + ":" + a.href;
        a.click();

        this.blur();
    };

    document.getElementById("restore_file").onchange = function()
    {
        if(this.files.length)
        {
            var filereader = new FileReader();
            emulator.stop();

            filereader.onload = async function(e)
            {
                await emulator.restore_state(e.target.result);
                emulator.run();
            };

            filereader.readAsArrayBuffer(this.files[0]);

            this.value = "";
        }

        this.blur();
    };
});

