<?php
include_once('config.php');
    
    $dep= $_GET['dep'];
    $dest= $_GET['dest'];
    $data = $_GET['data'];
    $z = $_SESSION["z"];
    
    if($z>18){
        $z=18;
    }
    
    $porp = Array();
    for ($i = 0; $i < count($_SESSION["fields"]); $i++){
        $prop[$_SESSION["fields"][$i]] = $data[$i];
    }

    $url = $osrm_url.'/viaroute?loc='.$dep.'&loc='.$dest.'?compression=false?alt=false?z='.$z; 
    
    $res = file_get_contents($url);
    $_SESSION["rows_remaining"] = $_SESSION["rows_remaining"] -1;
    $res_array = json_decode ($res,true);
if (isset ($res_array['status'])) {
        if ($res_array['status'] == 0 || $res_array['status'] == 200){ //=>ok!
            $res_route_summary = $res_array['route_summary'];
            $res_route_geometry = $res_array['route_geometry'];
        
            for ($i=0;$i<Count($res_route_geometry);$i++){
                $res_route_geometry[$i] = '['.$res_route_geometry[$i][1] .','.$res_route_geometry[$i][0].']';
            }
            $coord_str = implode(',',$res_route_geometry); 

            $prop['_total_distance'] = $res_route_summary['total_distance'];
            $prop['_total_time'] = $res_route_summary['total_time'];

            $feature_geometry = '"geometry": {"type": "LineString","coordinates":[' .$coord_str.']}';
            $properties = '"properties": ' .json_encode($prop, JSON_UNESCAPED_SLASHES) . '';
            
            if ($_SESSION["rows_remaining"] >0){
                $feature =  '{"type": "Feature",'.$feature_geometry.','.$properties . '},'.CHR(13);
            }
            else{
                $feature =  '{"type": "Feature",'.$feature_geometry.','.$properties . '}'.CHR(13) .']}';
            }
        
            $fp = fopen($path_file, 'a+');
            fwrite($fp, $feature);
            fclose($fp);
            echo json_encode(["status"=>$res_array['status'], "data"=>null]);
        }

        else{ //ko
            echo json_encode(["status"=>$res_array['status'], "data"=>$data]); 
        }
}
else{ //ko
        echo json_encode(["status"=>-1, "data"=>$data]); 
    }

?>

