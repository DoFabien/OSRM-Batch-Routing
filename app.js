var app = angular.module('MainApp', ['ngMaterial', 'ngFileUpload']);

app.controller('MainCtrl', function($scope, $window, Fctory, Upload) {
    $scope.fields = [];
    $scope.separateur = '';
    $scope.data_erreur = [];
    $scope.origine = { x: null, y: null };
    $scope.destination = { x: null, y: null };
    $scope.n_progress = 0;
    $scope.progress = 0;
    $scope.iti_ok = 0;
    $scope.iti_ko = 0;
    $scope.z_geom = 18;
    $scope.file = null;
    $scope.summary = '';
    $scope.encodage = 'UTF-8';
    $scope.isRunning = false;
    $scope.isCompleted = false;


    $scope.uploadFile = function(_file, errFiles) {
        $scope.file = _file;
        $scope.loadFile();
    }

    $scope.loadFile = function() {
        if ($scope.file) {
            var reader = new FileReader();
            reader.readAsText($scope.file, $scope.encodage);
            reader.addEventListener('load', function() {
                console.log('loaded');
   
                var row0 = reader.result.split('\n')[0];
                $scope.separateur = $scope.searchSeparateur(row0);
                $scope.fields = row0.split($scope.separateur);

                $scope.populateDataSrc(reader.result);
                $scope.summary = ($scope.fields.join(' | ') + '\n');

                for (var i = 0; i < 11; i++) {
                    if ($scope.data_src[i]) {
                        $scope.summary += $scope.data_src[i].join(' | ') + '\n';
                    }
                }
                $scope.$apply();
            });
        }
    }

    $scope.encodageChange = function() {
        console.log('change');
        $scope.loadFile();
    }

    $scope.searchSeparateur = function(row) {
        var separateur = ';';
        if (row.split(',').length > row.split(';').length) {
            separateur = ',';
        }
        if (row.split(/\t/).length > row.split(',').length) {
            separateur = '\t';
        }
        return (separateur);
    }


    var nb_req_limit = 200; //nb de requêtes simultanées

    $scope.populateDataSrc = function(str_full) {
        $scope.data_src = [];
        var rows = str_full.split('\n');
        for (var i = 1; i < rows.length; i++) {
            var row = rows[i].split($scope.separateur);
            if (row.length == $scope.fields.length){
                 $scope.data_src.push(row);
            } 
        }
    }



    var calculPartItis = function(start_ind) {
        var max_ind = ($scope.data_src.length > start_ind + nb_req_limit) ? start_ind + nb_req_limit : $scope.data_src.length;
        var current_ind = start_ind;
        for (var i = start_ind; i < max_ind; i++) {
       
            var current_row = $scope.data_src[i];
            var dep = parseFloat(current_row[$scope.fields.indexOf($scope.origine.y)].replace(',','.')) + ',' + parseFloat(current_row[$scope.fields.indexOf($scope.origine.x)].replace(',','.'));
            var dest = parseFloat(current_row[$scope.fields.indexOf($scope.destination.y)].replace(',','.')) + ',' + parseFloat(current_row[$scope.fields.indexOf($scope.destination.x)].replace(',','.'));


            Fctory.getIti(dep, dest, current_row, function(data) {
              
                    current_ind++;
                    if (data.status === 0 || data.status == 200) {
                        $scope.iti_ok++;
                    }
                    else {
                        $scope.iti_ko++;
                        console.log(data.data);
                        $scope.data_erreur.push(data.data.join(';'))
                    }

                    $scope.$apply(function() {
                        $scope.n_progress = $scope.n_progress + 1;
                        $scope.progress = Math.round(($scope.n_progress / $scope.data_src.length) * 100);
                    });
                    if (current_ind == max_ind) {
                        calculPartItis(max_ind);

                    }

                    if ($scope.n_progress == $scope.data_src.length) {
                        console.log('oh oh');
                        var time_exec = Math.round((new Date().getTime() - $scope.start) / 1000);
                        $scope.isRunning = false;
                        $scope.isCompleted = true;
                        $scope.$apply();
                        console.log(':-) executé en : ' + time_exec + 's');
                        return
                    }
                
            });

        }

    }

    $scope.calculItis = function() {
        if (!$scope.origine.y || !$scope.origine.x || !$scope.destination.x || !$scope.destination.y) {
            alert('Renseignez les 4 champs!')
            return
        }
        $scope.isRunning = true;
        $scope.n_progress = 0;
        $scope.progress = 0;
        $scope.iti_ok = 0;
        $scope.iti_ko = 0;

        Fctory.init($scope.fields, $scope.data_src.length, $scope.z_geom, function(data) {
            calculPartItis(0);
        })
        $scope.start = new Date().getTime();
        $scope.n_progress = 0;
    }

    $scope.export_ok = function() {
        window.open('./php/export.php')
    }

    $scope.export_errors = function() {
        var errors_csv = $scope.fields.join(';') + '\n' + $scope.data_erreur.join('\n');
        var blob = new Blob([errors_csv], {
            type: "text/plain;charset=utf-8"
        });
        saveAs(blob, "errors.csv");
    }
});