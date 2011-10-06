package flowersinthesand.example;

import java.io.IOException;
import java.io.PrintWriter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;

import javax.servlet.AsyncContext;
import javax.servlet.AsyncEvent;
import javax.servlet.AsyncListener;
import javax.servlet.ServletConfig;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import com.google.gson.Gson;

public class HttpChatServlet extends HttpServlet {

	private static final long serialVersionUID = -8823775068689773674L;

	/* Common */
	private BlockingQueue<String> messages = new LinkedBlockingQueue<String>();
	private Thread notifier = new Thread(new Runnable() {
		public void run() {
			boolean done = false;
			while (!done) {
				try {
					String message = messages.take();
					for (AsyncContext asyncContext : asyncContexts.values()) {
						try {
							// Message
							PrintWriter writer = asyncContext.getResponse().getWriter();
							writer.print(message.length());
							writer.print(";");
							writer.print(message);
							writer.print(";");
							writer.flush();
						} catch (Exception e) {
							asyncContexts.values().remove(asyncContext);
						}
					}
				} catch (InterruptedException e) {
					done = true;
				}
			}
		}
	});

	@Override
	public void init(ServletConfig config) throws ServletException {
		super.init(config);
		notifier.start();
	}

	@Override
	public void destroy() {
		messages.clear();
		asyncContexts.clear();
		notifier.interrupt();
	}

	/* HTTP Streaming powered by Servlet 3.0 */
	private Map<String, AsyncContext> asyncContexts = new ConcurrentHashMap<String, AsyncContext>();

	// GET method is used to open stream
	@Override
	protected void doGet(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		// Wrong access
		if ("websocket".equalsIgnoreCase(request.getHeader("Upgrade"))) {
			response.sendError(HttpServletResponse.SC_NOT_IMPLEMENTED);
			return;
		}

		response.setCharacterEncoding("utf-8");

		// Content-Type header
		response.setContentType("text/plain");

		// Access-Control-Allow-Origin header
		response.setHeader("Access-Control-Allow-Origin", "*");

		PrintWriter writer = response.getWriter();

		// Id
		final String id = UUID.randomUUID().toString();
		writer.print(id);
		writer.print(';');

		// Padding
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

	// POST method is used to handle data sent by user through the stream
	@Override
	protected void doPost(HttpServletRequest request, HttpServletResponse response)
			throws ServletException, IOException {
		request.setCharacterEncoding("utf-8");

		if ("close".equals(request.getParameter("metadata.type"))) {
			AsyncContext ac = asyncContexts.get(request.getParameter("metadata.id"));
			if (ac != null) {
				ac.complete();
			}

			return;
		}

		// Handles data sent from a client
		Map<String, String> data = new LinkedHashMap<String, String>();
		data.put("username", request.getParameter("username"));
		data.put("message", request.getParameter("message"));

		try {
			messages.put(new Gson().toJson(data));
		} catch (InterruptedException e) {
			throw new IOException(e);
		}
	}

}
