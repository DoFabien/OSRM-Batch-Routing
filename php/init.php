<?php
include_once('config.php');

$_SESSION["fields"] = $_GET['fields'];
$_SESSION["nb_rows"] = $_GET['nb_rows'];
$_SESSION["rows_remaining"] = $_GET['nb_rows'];
$_SESSION["z"] = $_GET['precision'];

$_SESSION["canceled"] = 0;
$_SESSION["count"] = 0;

$fp = fopen($path_file , 'w+');
fwrite($fp, '{ "type": "FeatureCollection", "features": ['.CHR(13));
fclose($fp);
echo json_encode('gogogo');
?>