<?php
session_start();
$_path = '/tmp/';
$path_file = $_path .'osrmiti_'.session_id().'.geojson';
$osrm_url = 'http://localhost:5000';

?>