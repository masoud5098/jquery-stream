// Configurations for Atmosphere
$.stream.setup({
	enableXDR: true,
	handleOpen: function(text, message) {
		message.index = text.indexOf("<!-- EOD -->") + 12;
	},
	handleSend: function(type) {
		if (type !== "send") {
			return false;
		}
	}
});