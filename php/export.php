<?php
include_once('config.php');

$size = filesize($path_file);
$nb_row = $_SESSION["nb_rows"];
header("Content-length: $size");
header('Content-Type: application/geojson');
header('Content-Disposition: attachment; filename="itis_'.$nb_row.'.geojson"');
readfile($path_file);
?>