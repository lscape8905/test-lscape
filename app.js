document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('searchBtn');
    const addressInput = document.getElementById('addressInput');
    const searchSection = document.getElementById('searchSection');
    const reportSection = document.getElementById('reportSection');
    const header = document.getElementById('header');
    const resetBtn = document.getElementById('resetBtn');

    // Values elements
    const reportAddress = document.getElementById('reportAddress');
    const valCategory = document.getElementById('valCategory');
    const valZoning = document.getElementById('valZoning');
    const valSlope = document.getElementById('valSlope');
    const valRestrictions = document.getElementById('valRestrictions');
    const statusBadge = document.getElementById('statusBadge');

    // --- API Configuration ---
    const API_KEY = 'D12D5EEE-FEDA-3EE2-9283-F25E42FD7653';
    const DOMAIN = 'lscape8905.github.io/test-lscape/';
    let vwMap = null;

    searchBtn.addEventListener('click', handleSearch);
    addressInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    resetBtn.addEventListener('click', () => {
        addressInput.value = '';
        reportSection.classList.add('hidden');
        searchSection.classList.remove('analyzed');
        header.classList.remove('compact');
    });

    async function handleSearch() {
        const address = addressInput.value.trim();
        if (!address) {
            alert('주소를 입력해주세요.');
            return;
        }

        // UI State: Loading
        const btnText = searchBtn.querySelector('.btn-text');
        const btnLoader = searchBtn.querySelector('.btn-loader');
        
        btnText.classList.add('hidden');
        btnLoader.classList.remove('hidden');
        searchBtn.disabled = true;
        statusBadge.textContent = "분석 중...";
        statusBadge.className = "badge warning";

        try {
            // 1. Geocoding (주소 -> 좌표)
            const coords = await getCoordinates(address);
            if (!coords) {
                alert('주소를 찾을 수 없습니다. 정확한 주소를 입력해주세요.');
                resetUI();
                return;
            }

            // 2. 토지특성 가져오기
            const landInfo = await getLandInfo(coords.x, coords.y);
            
            // 3. 규제정보 가져오기 (개발제한, 문화재)
            const restrictions = await getRestrictions(coords.x, coords.y);

            // Populate Data
            reportAddress.textContent = address;
            valCategory.textContent = landInfo.category || '정보 없음';
            valZoning.textContent = landInfo.zoning || '정보 없음';
            
            const terrainInfo = [];
            if (landInfo.terrainForm) terrainInfo.push(landInfo.terrainForm);
            if (landInfo.terrainHeight) terrainInfo.push(landInfo.terrainHeight);
            valSlope.textContent = terrainInfo.length > 0 ? terrainInfo.join(' / ') : '정보 없음';

            // Populate Restrictions
            valRestrictions.innerHTML = '';
            if (restrictions.length === 0) {
                valRestrictions.innerHTML = `<li class="restriction-item none"><span class="icon">✅</span> 저촉되는 주요 규제 없음</li>`;
            } else {
                restrictions.forEach(r => {
                    const li = document.createElement('li');
                    li.className = 'restriction-item';
                    li.innerHTML = `<span class="icon">⚠️</span> ${r} 저촉`;
                    valRestrictions.appendChild(li);
                });
            }

            // UI State: Show Report
            searchSection.classList.add('analyzed');
            header.classList.add('compact');
            reportSection.classList.remove('hidden');
            
            // Retrigger animations
            const cards = document.querySelectorAll('.card');
            cards.forEach(card => {
                card.style.animation = 'none';
                card.offsetHeight; // trigger reflow
                card.style.animation = null; 
            });

            statusBadge.textContent = "분석 완료";
            statusBadge.className = "badge success";

            // Initialize or Move 3D Map
            initOrUpdate3DMap(coords.x, coords.y);

        } catch (error) {
            console.error(error);
            alert(`[에러 발생] 화면을 캡처해서 보여주세요!\n\n${error.message}\n\n${error.stack}`);
        } finally {
            resetUI();
        }

        function resetUI() {
            btnText.classList.remove('hidden');
            btnLoader.classList.add('hidden');
            searchBtn.disabled = false;
        }
    }

    // --- API Calls ---

    // JSONP Helper Function to bypass CORS
    function fetchJsonp(url) {
        return new Promise((resolve, reject) => {
            const callbackName = 'vworld_jsonp_' + Math.round(100000 * Math.random());
            const script = document.createElement('script');
            script.src = url + '&callback=' + callbackName;
            
            window[callbackName] = function(data) {
                delete window[callbackName];
                document.body.removeChild(script);
                resolve(data);
            };
            
            script.onerror = function() {
                delete window[callbackName];
                document.body.removeChild(script);
                reject(new Error('JSONP Request Failed'));
            };
            
            document.body.appendChild(script);
        });
    }

    async function getCoordinates(address) {
        // 도로명 주소 검색 (JSONP 방식)
        const url = `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326&address=${encodeURIComponent(address)}&refine=true&simple=false&format=jsonp&type=road&key=${API_KEY}&domain=${DOMAIN}`;
        
        try {
            const data = await fetchJsonp(url);

            // API 키 또는 도메인 오류 확인
            if (data.response && data.response.status === 'ERROR') {
                alert('VWorld API 에러: ' + data.response.error.text + '\n(VWorld 개발자 센터에서 서비스 URL을 "lscape8905.github.io"로 정확히 수정해주세요!)');
                return null;
            }
            
            // 구조 수정: Address API는 result.items가 아니라 result.point를 반환합니다.
            if (data.response && data.response.status === 'OK' && data.response.result && data.response.result.point) {
                const pt = data.response.result.point;
                return { x: pt.x, y: pt.y };
            }
            
            // 지번 주소로 재시도
            const urlParcel = `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326&address=${encodeURIComponent(address)}&refine=true&simple=false&format=jsonp&type=parcel&key=${API_KEY}&domain=${DOMAIN}`;
            const data2 = await fetchJsonp(urlParcel);
            
            if (data2.response && data2.response.status === 'OK' && data2.response.result && data2.response.result.point) {
                const pt = data2.response.result.point;
                return { x: pt.x, y: pt.y };
            }
        } catch (e) {
            console.warn('JSONP Error in Geocoding:', e);
            alert('데이터 통신 오류가 발생했습니다. 개발자 도구를 확인해주세요.');
        }
        return null;
    }

    async function getLandInfo(x, y) {
        // VWorld Data API - LP_PA_CBND_BUBUN (토지특성정보)
        const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${API_KEY}&domain=${DOMAIN}&geomFilter=POINT(${x} ${y})`;
        
        const result = { category: null, zoning: null, terrainForm: null, terrainHeight: null };
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.response.status === 'OK' && data.response.result.featureCollection.features.length > 0) {
                const props = data.response.result.featureCollection.features[0].properties;
                result.category = props.lndcgr_code_nm; // 지목
                result.zoning = props.prpos_area_1_nm; // 용도지역
                result.terrainForm = props.tpgrph_frm_code_nm; // 지형형상
                result.terrainHeight = props.tpgrph_hg_code_nm; // 지형높이(경사)
            }
        } catch (e) {
            console.warn('Error fetching land info:', e);
        }
        return result;
    }

    async function getRestrictions(x, y) {
        const restrictions = [];
        // 1. 개발제한구역 (LT_C_UD801)
        const devLimitUrl = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_UD801&key=${API_KEY}&domain=${DOMAIN}&geomFilter=POINT(${x} ${y})`;
        try {
            const res1 = await fetch(devLimitUrl);
            const data1 = await res1.json();
            if (data1.response.status === 'OK' && data1.response.result.featureCollection.features.length > 0) {
                restrictions.push('개발제한구역');
            }
        } catch(e) {}

        // 2. 문화재보호구역 (LT_C_LHCHB)
        const culturalUrl = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_LHCHB&key=${API_KEY}&domain=${DOMAIN}&geomFilter=POINT(${x} ${y})`;
        try {
            const res2 = await fetch(culturalUrl);
            const data2 = await res2.json();
            if (data2.response.status === 'OK' && data2.response.result.featureCollection.features.length > 0) {
                restrictions.push('문화재보호구역');
            }
        } catch(e) {}

        return restrictions;
    }

    function initOrUpdate3DMap(x, y) {
        try {
            const mapContainer = document.getElementById('vmap');
            
            if (!window.vw || !window.vw.Map) {
                mapContainer.innerHTML = '<div style="color:white; padding: 20px; text-align:center;">VWorld 3D 엔진이 아직 로드되지 않았거나 지원되지 않습니다.</div>';
                return;
            }

            // 완전히 새로 그리기 위해 컨테이너 초기화
            mapContainer.innerHTML = '';
            
            let mapOptions = new vw.MapOptions(
                vw.BasemapType.GRAPHIC,
                "",
                vw.DensityType.FULL,
                vw.DensityType.BASIC,
                false,
                new vw.CameraPosition(new vw.CoordZ(Number(x), Number(y), 1000), new vw.Direction(0, -45, 0)),
                new vw.CameraPosition(new vw.CoordZ(Number(x), Number(y), 1000), new vw.Direction(0, -45, 0))
            );

            vwMap = new vw.Map("vmap", mapOptions);
        } catch (err) {
            console.error('3D Map Initialization Error:', err);
            document.getElementById('vmap').innerHTML = '<div style="color:white; padding: 20px; text-align:center;">3D 지도를 렌더링하는 중 오류가 발생했습니다.<br>(API 권한 문제일 수 있습니다.)</div>';
        }
    }
});
