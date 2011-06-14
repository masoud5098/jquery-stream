<%
	if ("GET".equals(request.getMethod())) {
		if ("websocket".equalsIgnoreCase(request.getHeader("Upgrade"))) {
			response.sendError(HttpServletResponse.SC_NOT_IMPLEMENTED);
			return;
		}
		
		response.setContentType("text/plain");
		response.setHeader("Access-Control-Allow-Origin", "*");

		out.print(java.util.UUID.randomUUID());
		out.print(';');

		for (int i = 0; i < 1024; i++) {
			out.print(' ');
		}
		out.print(';');
		out.flush();

		for (int i = 10; i > 0; i--) {
			Thread.sleep(1000);
			String message = String.valueOf(i);
			out.print(message.length() + ";" + message + ";");
			out.flush();
		}
	}
%>