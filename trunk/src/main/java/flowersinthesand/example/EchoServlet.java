package flowersinthesand.example;

import java.io.IOException;
import java.io.PrintWriter;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import javax.servlet.AsyncContext;
import javax.servlet.AsyncEvent;
import javax.servlet.AsyncListener;
import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.eclipse.jetty.util.UrlEncoded;
import org.eclipse.jetty.websocket.WebSocket;
import org.eclipse.jetty.websocket.WebSocketServlet;

@WebServlet(urlPatterns = "/example/echo", asyncSupported = true)
public class EchoServlet extends WebSocketServlet {

	private static final long serialVersionUID = -8823775068689773674L;

	private Map<String, AsyncContext> asyncContexts = new ConcurrentHashMap<String, AsyncContext>();

	@Override
	protected void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		response.setCharacterEncoding("utf-8");
		response.setContentType("text/plain");
		response.setHeader("Access-Control-Allow-Origin", "*");

		PrintWriter writer = response.getWriter();

		final String id = UUID.randomUUID().toString();
		writer.print(id);
		writer.print(';');

		for (int i = 0; i < 1024; i++) {
			writer.print(' ');
		}
		writer.print(';');
		writer.flush();

		final AsyncContext ac = request.startAsync();
		ac.setTimeout(5 * 60 * 1000);
		ac.addListener(new AsyncListener() {
			public void onComplete(AsyncEvent event) throws IOException {
				asyncContexts.remove(id);
			}

			public void onTimeout(AsyncEvent event) throws IOException {
				asyncContexts.remove(id);
			}

			public void onError(AsyncEvent event) throws IOException {
				asyncContexts.remove(id);
			}

			public void onStartAsync(AsyncEvent event) throws IOException {

			}
		});
		asyncContexts.put(id, ac);
	}

	@Override
	protected void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		request.setCharacterEncoding("utf-8");

		AsyncContext ac = asyncContexts.get(request.getParameter("metadata.id"));
		if (ac == null) {
			return;
		}

		if ("close".equals(request.getParameter("metadata.type"))) {
			ac.complete();
			return;
		}

		String message = request.getParameter("message");
		PrintWriter writer = ac.getResponse().getWriter();

		writer.print(message.length() + ";" + message + ";");
		writer.flush();
	}

	@Override
	public WebSocket doWebSocketConnect(HttpServletRequest request, String protocol) {
		return new WebSocket.OnTextMessage() {

			Connection connection;

			@Override
			public void onOpen(Connection connection) {
				this.connection = connection;
			}

			@Override
			public void onClose(int closeCode, String message) {

			}

			@Override
			public void onMessage(String data) {
				UrlEncoded parameters = new UrlEncoded(data);
				try {
					connection.sendMessage(parameters.getString("message"));
				} catch (IOException e) {
					throw new RuntimeException(e);
				}
			}

		};
	}

}
