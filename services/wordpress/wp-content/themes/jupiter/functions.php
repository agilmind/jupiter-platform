<?php
function disable_wp_favicon() {
    remove_action('wp_head', 'wp_site_icon', 99);
}
add_action('init', 'disable_wp_favicon');