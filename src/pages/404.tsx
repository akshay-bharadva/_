import Head from "next/head";
import Layout from "@/components/layout";
import NotFoundComponent from "@/components/not-found";
import { config as appConfig } from "@/lib/config";

export default function Custom404Page() {
  return (
    <Layout>
      <Head>
        <title>{`Page Not Found | ${appConfig.site.title}`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <NotFoundComponent />
    </Layout>
  );
}
