
var booted_up = false;
var selected_file = null;
var models = {};
var listeners = {};
const ide_files = ['main.c', 'bot_api.h', 'sdcc-backend.asm', 'build.sh'];
const keywords = [
    "return",
    "printf",
    "bot_get_x",
    "bot_get_y",
    "bot_get_me",
    "bot_get_energy",
    "bot_get_seed",
    "bot_move_up",
    "bot_move_down",
    "bot_move_left",
    "bot_move_right",
    "bot_split_up",
    "bot_split_down",
    "bot_split_left",
    "bot_split_right",
    "bot_scan",
    "bot_hibernate",
    "bot_enable_shared_memory"
];

const extension_to_language_map = {
    c: "c",
    h: "c",
    asm: "assembly",
    sh: "shell"
};

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

async function load_file(emulator, filename)
{
    const local = localStorage.getItem(filename);
    if (local)
    {
        const enc = new TextEncoder().encode(local);
        await emulator.create_file('/' + filename, new Uint8Array(enc));
    }
    else
    {
        const response = await fetch('fs/' + filename);
        const buffer = await response.arrayBuffer();
        await emulator.create_file('/' + filename, new Uint8Array(buffer));
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

function delay(ms)
{
    return new Promise(resolve => setTimeout(resolve, ms));
}

function get_filename_id(f) {
    return f.replace('.', '-');
}

// Function to guess the language
function guess_language(fileName) {
    const ext = fileName.split('.').pop(); // Extract file extension
    return extension_to_language_map[ext] || "c"; // Default to plaintext
}

async function refresh_files(emulator) {
    //  <button type="button" className="btn file btn-secondary file-active">Button</button>
    // <button type="button" className="btn file btn-outline-secondary">Button</button>
    const buttons = $('#file-list-buttons');
    buttons.html('');

    const files = emulator.fs9p.read_dir('/');
    for (let file in files)
    {
        const filename = files[file];
        const fname_id = get_filename_id(filename);
        const btn = $('<button type="button" class="btn file btn-outline-secondary" id="file-' + fname_id + '">' + filename + '</button>').appendTo(buttons);

        const b = await emulator.read_file('/' + filename);
        const content = new TextDecoder().decode(b);
        const model = monaco.editor.createModel(content, guess_language(filename));
        models[filename] = model;

        btn.click(() => {
            select_file(emulator, filename);
        });

        const listener = model.onDidChangeContent(async () => {
            localStorage.setItem(filename, model.getValue());
            const buffer = new TextEncoder().encode(model.getValue());
            await emulator.create_file('/' + filename, new Uint8Array(buffer));
        });

        // Save listener for disposal
        listeners[filename] = listener;
    }
}

async function select_file(emulator, filename) {
    selected_file = filename;
    const fname_id = get_filename_id(filename);
    $('.file').removeClass('btn-secondary').addClass('btn-outline-secondary');
    $('#file-' + fname_id).removeClass('btn-outline-secondary').addClass('btn-secondary');
    window.myEditor.setModel(models[filename]);
}

function load_emulator() {
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
        for (let fid in ide_files)
        {
            await load_file(emulator, ide_files[fid]);
        }

        await refresh_files(emulator);
        await select_file(emulator, 'main.c');

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
    require.config({ paths: { 'vs': 'vs' } });

    require(['vs/editor/editor.main'], function () {
        const editor = monaco.editor.create(document.getElementById('editor-container'), {
            language: 'c',
            theme: 'vs-dark',
            automaticLayout: true
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

                const suggestions = [];

                for (let kid in keywords)
                {
                    suggestions.push({
                        label: keywords[kid],
                        kind: monaco.languages.CompletionItemKind.Function,
                        insertText: keywords[kid],
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        range: range
                    })
                }

                // Return a list of suggestions
                return {
                    suggestions: suggestions
                };
            }
        });

        // Access the editor instance for additional functionality
        window.myEditor = editor;
    });

    const emulator = load_emulator();

    $('#build-button').click(async () =>{
        await emulator.serial0_send('/bin/sh /work/build.sh\n');
    });

    $('#play-button').click(async () => {
        const result = await emulator.read_file('/build.bin');
        const runTab = await open_tab_await('../run.html');
        await delay(200);
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

