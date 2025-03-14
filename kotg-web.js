const BOTS_CONTENTS = "https://api.github.com/repos/kingofthegrid/bots/contents/bots";

var KOTG = {
    print: function (e) {
        $('#systme-log').append(e + '</br>')
        console.log(e);
    },
    printErr: function (e) {
        $('#systme-log').append('<span class="text-danger">' + e + '</span><br/>')
        console.log("Error: " + e);
    },
    onRuntimeInitialized: function () {
        console.log("WASM Module Initialized");
    }
};

var bot_a_selected = false;
var bot_b_selected = false;
var bot_a_name = "";
var bot_b_name = "";

function check_trigger_game()
{
    if (!bot_a_selected)
        return;
    if (!bot_b_selected)
        return;

    $('#bots-selector').hide();
    $('#game-header').hide();
    $('#game-panel').show();
    $('#game-panel-body').hide();

    $('#systme-log').append('<span class="text-info"><i class="bi bi-gear"></i> Simulating game, please stand by...</span><br/>');

    const seed = Number($('#seed').val());

    setTimeout(function()
    {
        var result;

        try
        {
            // Example: Call a C++ function to process the file
            result = KOTG.ccall("test_programs", "number", ["string", "string", "number"],
                [bot_a_name, bot_b_name, seed]);
        }
        catch ({ name, message })
        {
            $('#systme-log').append('<span class="text-danger">' + message + '</span><br/>');
            $('#game-panel-body').hide();
            return;
        }

        $('#game-panel-body').show();

        if (result >= 0)
        {
            if (result === 0)
            {
                $('#game-panel-title').html('<span class="text-info"><i class="bi bi-exclamation-circle-fill"></i> It\'s a draw!</span>');
            }
            else if (result === 1)
            {
                $('#game-panel-title').html('<span class="text-success"><i class="bi bi-exclamation-circle-fill"></i> First bot (' + bot_a_name + ') won!</span>');
            }
            else if (result === 2)
            {
                $('#game-panel-title').html('<span class="text-success"><i class="bi bi-exclamation-circle-fill"></i> Second bot (' + bot_b_name + ') won!</span>');
            }

            // Retrieve processed file
            const outputData = FS.readFile("/recording.txt");

            var decoder = new TextDecoder('utf8');
            var b64encoded = btoa(unescape(encodeURIComponent(decoder.decode(outputData))));

            const recordingDataUri = `data:application/json;base64,${b64encoded}`;

            $('#asciinema-player').html('');

            // Initialize the Asciinema player
            AsciinemaPlayer.create(
                recordingDataUri,
                $('#asciinema-player')[0],
                {
                    autoplay: true,
                    loop: false,
                    theme: "asciinema",
                    fit: "width"
                }
            );
        }
    }, 500);
}

function load_file(reader, file_name, select_node, label_node, card_node, custom_note)
{
    const data = new Uint8Array(reader.result);

    try
    {
        FS.createDataFile("/", file_name, data, true, true);
    }
    catch ({ name, message }) {
        if (message == "File exists")
        {
            // ignore
        }
        else
        {
            label_node.html('<i class="bi bi-exclamation-triangle-fill"></i> ' + message).addClass('text-danger');
            return false;
        }
    }

    select_node.text('Loaded <' + file_name + '>');
    card_node.addClass('border-success');

    if (!custom_note)
    {
        custom_note = 'Selected!';
    }

    label_node.html('<i class="bi bi-check-circle-fill"></i> ' + custom_note).addClass('text-success');
    return true;
}

$(function ()
{
    $('#bot-a-file').on('change', function (event) {
        const fileInput = $('#bot-a-file')[0];
        if (!fileInput.files.length) {
            alert("Please select a file first!");
            return;
        }

        const file = fileInput.files[0];
        const reader = new FileReader();

        reader.onload = function () {
            if (load_file(reader, file.name, $('#bot-a-file-name'), $('#bot-a-selected'), $('#card-a')))
            {
                bot_a_name = file.name;
                bot_a_selected = true;
                check_trigger_game();
            }
        };

        reader.readAsArrayBuffer(file);
    });

    $('#bot-b-file').on('change', function (event) {
        const fileInput = $('#bot-b-file')[0];
        if (!fileInput.files.length) {
            alert("Please select a file first!");
            return;
        }

        const file = fileInput.files[0];
        const reader = new FileReader();

        reader.onload = function ()
        {
            if (load_file(reader, file.name, $('#bot-b-file-name'), $('#bot-b-selected'), $('#card-b')))
            {
                bot_b_name = file.name;
                bot_b_selected = true;
                check_trigger_game();
            }
        };

        reader.readAsArrayBuffer(file);
    });

    $.ajax({
        url: BOTS_CONTENTS,
        method: "GET",
        success: function(data)
        {
            const select_a = $("#bot-a-select");
            const select_b = $("#bot-b-select");
            select_a.empty();
            select_b.empty();

            select_a.append(`<option selected>Or select Existing</option>`);
            select_b.append(`<option selected>Or select Existing</option>`);

            data.forEach(function(item) {
                select_a.append(`<option value="${item.name}" data-url="${item.download_url}">${item.name}</option>`);
                select_b.append(`<option value="${item.name}" data-url="${item.download_url}">${item.name}</option>`);
            });

            $('#bot-a-select').on('change', function (event) {
                const bot_name = $('#bot-a-select').val();

                $.ajax({
                    url: $('#bot-a-select option:selected').data('url'),
                    method: "GET",
                    xhrFields: {
                        responseType: "blob"
                    },
                    success: function (data) {
                        const reader = new FileReader();

                        // When the FileReader finishes reading
                        reader.onload = function (event) {
                            if (load_file(reader, bot_name, $('#bot-a-file-name'), $('#bot-a-selected'), $('#card-a')))
                            {
                                bot_a_name = bot_name;
                                bot_a_selected = true;
                                check_trigger_game();
                            }
                        };
                        reader.readAsArrayBuffer(data);
                    },
                    error: function (xhr, status, error) {
                        $('#bot-a-selected').html('<i class="bi bi-exclamation-triangle-fill"></i> ' + error).addClass('text-danger');
                    }
                });
            });

            $('#bot-b-select').on('change', function (event) {
                const bot_name = $('#bot-b-select').val();

                $.ajax({
                    url: $('#bot-b-select option:selected').data('url'),
                    method: "GET",
                    xhrFields: {
                        responseType: "blob"
                    },
                    success: function (data) {
                        const reader = new FileReader();

                        // When the FileReader finishes reading
                        reader.onload = function (event) {
                            if (load_file(reader, bot_name, $('#bot-b-file-name'), $('#bot-b-selected'), $('#card-b')))
                            {
                                bot_b_name = bot_name;
                                bot_b_selected = true;
                                check_trigger_game();
                            }
                        };
                        reader.readAsArrayBuffer(data);
                    },
                    error: function (xhr, status, error) {
                        $('#bot-b-selected').html('<i class="bi bi-exclamation-triangle-fill"></i> ' + error).addClass('text-danger');
                    }
                });
            });
        },
        error: function(xhr, status, error)
        {
            console.error("Error:", error);
        }
    });
});

window.addEventListener('message', (event) => {
    console.log('Received program data:', event.data);

    const reader = new FileReader();

    reader.onload = function (event) {
        if (load_file(reader, "devbot", $('#bot-a-file-name'), $('#bot-a-selected'), $('#card-a'), 'Loaded from IDE!'))
        {
            bot_a_name = "devbot";
            bot_a_selected = true;
            check_trigger_game();
        }
    };
    reader.readAsArrayBuffer(new Blob([event.data]));
});
