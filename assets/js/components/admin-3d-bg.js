/**
 * admin-3d-bg.js
 * Lightweight Three.js floating particles + torus knot for admin sidebar background
 * Uses --color-primary (#071022) & --color-accent (#365aa2) from site identity
 */
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.innerWidth <= 768) return;

  const wrap = document.getElementById('admin-3d-bg');
  if (!wrap) return;

  // Load three.js from CDN then run scene
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.min.js';
  script.onload = function () {
    initScene(wrap);
  };
  document.head.appendChild(script);

  function initScene(container) {
    const W = container.clientWidth;
    const H = container.clientHeight;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
    camera.position.set(0, 0, 4.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // --- Main torus knot (representing the brand ring) ---
    const torusGeo = new THREE.TorusKnotGeometry(0.75, 0.22, 90, 14, 2, 3);
    const torusMat = new THREE.MeshStandardMaterial({
      color: 0x365aa2,
      metalness: 0.4,
      roughness: 0.45,
      emissive: 0x1a2f5a,
      emissiveIntensity: 0.35,
      wireframe: false,
    });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    torus.position.set(0, 0.3, 0);
    scene.add(torus);

    // --- Floating particles ---
    const particleCount = 60;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 6;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4 - 1;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x4a72bf,
      size: 0.055,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x9cbff7, 1.2);
    dirLight.position.set(3, 5, 4);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0xffd154, 0.5);
    rimLight.position.set(-3, -2, -2);
    scene.add(rimLight);

    // --- Animate ---
    let raf;
    function animate() {
      raf = requestAnimationFrame(animate);
      torus.rotation.x += 0.004;
      torus.rotation.y += 0.007;
      particles.rotation.y += 0.0008;
      renderer.render(scene, camera);
    }
    animate();

    // Handle resize
    function onResize() {
      const nW = container.clientWidth;
      const nH = container.clientHeight;
      camera.aspect = nW / nH;
      camera.updateProjectionMatrix();
      renderer.setSize(nW, nH);
    }
    window.addEventListener('resize', onResize);

    // Hide on mobile after resize below 768
    window.addEventListener('resize', function () {
      if (window.innerWidth <= 768) {
        cancelAnimationFrame(raf);
        renderer.domElement.remove();
        wrap.style.display = 'none';
      }
    });
  }
})();

