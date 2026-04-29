export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <header>
                <h1>MorphoViewer Test</h1>
            </header>
            <main>{children}</main>
        </div>
    )
}
