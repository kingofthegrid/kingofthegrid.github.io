$(function ()
{
    const path = window.location.hash.substring(1);

    $('#game-panel-title').html('<i class="bi bi-cloud"></i> Watching: ' + path).addClass('text-success');

    // Initialize the Asciinema player
    AsciinemaPlayer.create(
        path,
        $('#asciinema-player')[0],
        {
            autoplay: true,
            loop: false,
            theme: "asciinema",
            fit: "width"
        }
    );
});