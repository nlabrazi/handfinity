import { gsap } from "gsap";

/** À construire dans le contexte de l'accueil pour limiter tous les sélecteurs. */
export function createHomeAmbience() {
	const timeline = gsap.timeline({ paused: true });
	function oscillate(
		target: string,
		from: gsap.TweenVars,
		to: gsap.TweenVars,
		duration: number,
	) {
		timeline.fromTo(
			target,
			from,
			{
				...to,
				duration,
				ease: "sine.inOut",
				repeat: -1,
				yoyo: true,
			},
			0,
		);
	}

	oscillate(".world-glow", { opacity: 0.7 }, { opacity: 1 }, 12);
	oscillate(
		".world-dust",
		{ x: 0, y: 0, opacity: 0.4 },
		{ x: 9, y: -14, opacity: 0.9 },
		18,
	);
	oscillate(
		".holographic-hand",
		{ y: 0, rotation: -8, transformOrigin: "50% 50%" },
		{ y: -12, rotation: -6 },
		5,
	);
	oscillate(
		".hand-scan",
		{ y: -150, opacity: 0.1 },
		{ y: 160, opacity: 0.7 },
		4.5,
	);
	oscillate(
		".tracking-scan",
		{ y: -50, opacity: 0.25 },
		{ y: 55, opacity: 0.8 },
		4,
	);
	oscillate(
		".hand-beacons, .paint-tip",
		{ opacity: 0.35 },
		{ opacity: 0.9 },
		3,
	);
	oscillate(".paint-sparks", { opacity: 0.35 }, { opacity: 0.9 }, 4);

	timeline.to(
		".orbital-track",
		{
			rotation: 360,
			transformOrigin: "50% 50%",
			duration: 90,
			repeat: -1,
			ease: "none",
		},
		0,
	);
	timeline.fromTo(
		".world-streams path:nth-child(2)",
		{ strokeDashoffset: 0 },
		{
			strokeDashoffset: -2040,
			duration: 30,
			repeat: -1,
			ease: "none",
		},
		0,
	);

	const paint = gsap.timeline({ repeat: -1, defaults: { ease: "sine.inOut" } });
	paint
		.fromTo(
			".paint-line",
			{ strokeDashoffset: 0, opacity: 0.8 },
			{
				strokeDashoffset: 850,
				opacity: 0.2,
				duration: 1.8,
			},
		)
		.to(".paint-line", { strokeDashoffset: 0, opacity: 1, duration: 4.44 })
		.to(".paint-line", { opacity: 1, duration: 3.96 })
		.to(".paint-line", { opacity: 0.8, duration: 1.8 });
	timeline.add(paint, 0);
	return timeline;
}
