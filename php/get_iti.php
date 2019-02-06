<?php
include_once('config.php');
    
    $dep= $_GET['dep'];
    $dest= $_GET['dest'];
    $data = $_GET['data'];
    $z = $_SESSION["z"];
    
    if($z>18){
        $z=18;
    }
    
    $prop = Array();
    for ($i = 0; $i < count($_SESSION["fields"]); $i++){
        $prop[$_SESSION["fields"][$i]] = $data[$i];
    }

    $depCoords = explode(',',$dep);
    $destCoords = explode(',',$dest);
    $url = $osrm_url."/route/v1/driving/$depCoords[1],$depCoords[0];$destCoords[1],$destCoords[0]?geometries=geojson&overview=full";

    $res = file_get_contents($url);
    $_SESSION["rows_remaining"] = $_SESSION["rows_remaining"] -1;
    $res_array = json_decode ($res,true);

if (isset ($res_array['code'])) {
        if ($res_array['code'] == 'Ok'){
            $route = $res_array['routes'][0];

            $feature_geometry = $route['geometry'];
            
            $feature = [];
            $feature['type'] = "Feature";
            $feature['geometry'] = $route['geometry'];
            $feature['properties'] = $prop ;
            $feature['properties']['_total_distance'] = $route['distance'];
            $feature['properties']['_total_time'] = $route['duration'];

            if ($_SESSION["count"] == 0) { // => 1ere ligne, pas de virgule devant
                 $featureStr =  json_encode($feature) . CHR(13);
            } else {
                 $featureStr =  ',' . json_encode($feature) . CHR(13);
            }
            
            $_SESSION["count"] = $_SESSION["count"] + 1;
            $fp = fopen($path_file, 'a+');
            fwrite($fp, $featureStr);
            fclose($fp);
            echo json_encode(["status"=>200, "data"=>null]);
        }

        else{ //ko
            echo json_encode(["status"=>-1, "data"=>$data]); 
        }
}
else{ //ko
        echo json_encode(["status"=>-1, "data"=>$data]); 
    }

if ($_SESSION["rows_remaining"] == 0){
    $fp = fopen($path_file, 'a+');
    fwrite($fp, CHR(13) .']}');
    fclose($fp);
} 

?>

