export default function App() {
  return (
    <main
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100vh',
        fontFamily: 'sans-serif',
        background: '#1554B8',
        color: '#fff',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <img src="/assets/logo.png" alt="Logo da Fundação Parreira Horta" width={220} />
        <h1>Gestão da frota do FSPH</h1>
        <p>Projeto base do front-end rodando.</p>
      </div>
    </main>
  )
}
