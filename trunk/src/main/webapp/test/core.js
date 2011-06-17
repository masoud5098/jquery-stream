asyncTest("$.stream() - Echo", function() {
	var data = "Hello World";
	
	$.stream("/jquery-stream/echo", {
		open: function(event, stream) {
			stream.send({message: data});
		},
		message: function(event, stream) {
			strictEqual(event.data, data);
			stream.close();
			start();
		}
	});
});