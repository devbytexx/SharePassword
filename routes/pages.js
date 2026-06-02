export default async function pageRoutes(app) {
  // /s/<token> serves the view page; token is read from URL by JS
  app.get('/s/:token', async (req, reply) => {
    return reply.type('text/html').sendFile('s.html');
  });
}
