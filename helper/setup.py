from setuptools import setup

setup(
    name='scrapyard_helper',
    version='0.1.0',
    packages=['scrapyard'],
    url='',
    license='',
    author='gchristnsn',
    author_email='gchristnsn@gmail.com',
    description='',
    install_requires=['Flask'],
    entry_points = {
        'console_scripts': ['scrapyard_helper=scrapyard.helper:main'],
    }
)
