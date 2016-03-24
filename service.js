app.factory('Fctory', function() {
    var factory = {


        getIti: function(dep, dest,_data, callback) {
            $.ajax({
                type: "GET",
                data: { dep: dep, dest: dest, data:_data },
                url: 'php/get_iti.php',
                dataType: 'json',
                success: function(data) {
                    return callback(data);
                }
            });
        },
        init: function(fields, nb_rows,precision, callback) {
            $.ajax({
                type: "GET",
                data: { fields: fields, nb_rows: nb_rows, precision :precision },
                url: 'php/init.php',
                dataType: 'json',
                success: function(data) {
                    return callback(data);
                }
            });
        },
        getSession: function(callback) {
            $.ajax({
                type: "GET",
                url: 'php/session.php',
                dataType: 'json',
                success: function(data) {
                    return callback(data);
                },
                error: function(er) {
                    return er;
                }
            });
        },
        getProjections : function(callback){
               $.ajax({
                type: "GET",
                url: './projections.json',
                dataType: 'json',
                success: function(data) {
                    return callback(data);
                },
                error: function(er) {
                    return er;
                }
            });
        }
    }
    return factory;
});
