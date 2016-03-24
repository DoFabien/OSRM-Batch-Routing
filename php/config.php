<?php
session_start();
$_path = '/tmp/';
$path_file = $_path .'osrmiti_'.session_id().'.geojson';
//$osrm_url = 'http://localhost:5001';
$osrm_url = 'http://dogeo.fr:5001';

?>